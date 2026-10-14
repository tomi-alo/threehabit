"use server";

import { revalidatePath } from "next/cache";
import {
  capMessage,
  isDay,
  missNote,
  previousDay,
  type CheckinRecord,
  type CheckinStatus,
  type HabitOption,
  type HabitPosition,
  type HabitRecord,
} from "@/lib/habits";
import { createClient } from "@/lib/supabase/server";

export type Board = {
  habits: HabitRecord[];
  checkins: CheckinRecord[];
  suggestions: HabitOption[];
  library: HabitOption[];
  error: string | null;
};

type CommitmentRow = {
  position: number;
  habits: HabitOption | HabitOption[] | null;
};

type CheckinRow = {
  habit_id: string;
  status: string;
  miss_note: string | null;
};

function asPosition(position: number): HabitPosition {
  if (position === 1 || position === 2 || position === 3) return position;
  throw new Error("Habit position is outside 1–3.");
}

function asStatus(status: string): CheckinStatus {
  if (status === "done" || status === "missed") return status;
  throw new Error("Check-in status is not done or missed.");
}

function relatedHabit(relation: CommitmentRow["habits"]): HabitOption | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first.");
  return { supabase, user };
}

export async function loadBoard(day: string): Promise<Board> {
  if (!isDay(day)) {
    return {
      habits: [],
      checkins: [],
      suggestions: [],
      library: [],
      error: "That date is not valid.",
    };
  }

  try {
    const { supabase, user } = await requireUser();
    const empty = {
      habits: [],
      checkins: [],
      suggestions: [],
      library: [],
    };
    const [commitmentsResult, libraryResult, suggestionsResult] = await Promise.all([
      supabase
        .from("commitments")
        .select("position, habits!inner(id, name)")
        .eq("user_id", user.id)
        .eq("day", day)
        .order("position"),
      supabase
        .from("habits")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("commitments")
        .select("position, habits!inner(id, name)")
        .eq("user_id", user.id)
        .eq("day", previousDay(day))
        .order("position"),
    ]);

    const queryError =
      commitmentsResult.error ?? libraryResult.error ?? suggestionsResult.error;
    if (queryError) return { ...empty, error: queryError.message };

    const habits = ((commitmentsResult.data ?? []) as CommitmentRow[])
      .map((row) => {
        const habit = relatedHabit(row.habits);
        return habit
          ? { ...habit, position: asPosition(row.position) }
          : null;
      })
      .filter((habit): habit is HabitRecord => habit !== null);

    const selectedIds = new Set(habits.map((habit) => habit.id));
    const yesterday = ((suggestionsResult.data ?? []) as CommitmentRow[])
      .map((row) => relatedHabit(row.habits))
      .filter((habit): habit is HabitOption => habit !== null);
    const suggestions = yesterday.filter((habit) => !selectedIds.has(habit.id));
    const suggestionIds = new Set(suggestions.map((habit) => habit.id));
    const library = ((libraryResult.data ?? []) as HabitOption[]).filter(
      (habit) => !selectedIds.has(habit.id) && !suggestionIds.has(habit.id),
    );

    let checkins: CheckinRecord[] = [];
    if (habits.length > 0) {
      const { data: checkinRows, error: checkinError } = await supabase
        .from("checkins")
        .select("habit_id, status, miss_note")
        .eq("user_id", user.id)
        .eq("day", day)
        .in(
          "habit_id",
          habits.map((habit) => habit.id),
        );

      if (checkinError) {
        return { habits, checkins, suggestions, library, error: checkinError.message };
      }

      checkins = ((checkinRows ?? []) as CheckinRow[]).map((row) => ({
        habitId: row.habit_id,
        status: asStatus(row.status),
        missNote: row.miss_note,
      }));
    }

    return { habits, checkins, suggestions, library, error: null };
  } catch (error) {
    return {
      habits: [],
      checkins: [],
      suggestions: [],
      library: [],
      error: error instanceof Error ? error.message : "Could not load habits.",
    };
  }
}

async function boardAfterChange(day: string, error: string | null) {
  if (error) return { error, board: null as Board | null };
  revalidatePath("/");
  return { error: null, board: await loadBoard(day) };
}

export async function addHabit(name: string, day: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name the habit.", board: null };
  if (!isDay(day)) return { error: "That date is not valid.", board: null };

  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("set_commitment", {
      p_day: day,
      p_habit_id: null,
      p_name: trimmed,
    });

    if (error) return { error: commitmentError(error), board: null };
    return boardAfterChange(day, null);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not add the habit.",
      board: null,
    };
  }
}

export async function selectHabit(habitId: string, day: string) {
  if (!habitId) return { error: "Choose a habit.", board: null };
  if (!isDay(day)) return { error: "That date is not valid.", board: null };

  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("set_commitment", {
      p_day: day,
      p_habit_id: habitId,
      p_name: null,
    });

    if (error) return { error: commitmentError(error), board: null };
    return boardAfterChange(day, null);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not choose the habit.",
      board: null,
    };
  }
}

function commitmentError(error: { code?: string; message: string }): string {
  if (error.code !== "23505") return error.message;
  if (error.message.includes("already committed")) {
    return "That habit is already committed today.";
  }
  return capMessage(3) ?? error.message;
}

export async function markDone(habitId: string, day: string) {
  if (!isDay(day)) return { error: "That date is not valid.", board: null };

  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("checkins").upsert(
      {
        habit_id: habitId,
        user_id: user.id,
        day,
        status: "done",
        miss_note: null,
      },
      { onConflict: "habit_id,day" },
    );
    if (error) return { error: error.message, board: null };
    return boardAfterChange(day, null);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not mark it done.",
      board: null,
    };
  }
}

export async function markMissed(habitId: string, day: string, note: string) {
  if (!isDay(day)) return { error: "That date is not valid.", board: null };

  let cleaned = "";
  try {
    cleaned = missNote(note);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Write a miss note.",
      board: null,
    };
  }

  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("checkins").upsert(
      {
        habit_id: habitId,
        user_id: user.id,
        day,
        status: "missed",
        miss_note: cleaned,
      },
      { onConflict: "habit_id,day" },
    );
    if (error) return { error: error.message, board: null };
    return boardAfterChange(day, null);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save the miss.",
      board: null,
    };
  }
}

export async function clearCheckin(habitId: string, day: string) {
  if (!isDay(day)) return { error: "That date is not valid.", board: null };

  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("checkins")
      .delete()
      .eq("habit_id", habitId)
      .eq("user_id", user.id)
      .eq("day", day);
    if (error) return { error: error.message, board: null };
    return boardAfterChange(day, null);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not clear the day.",
      board: null,
    };
  }
}

export async function signIn(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { error: null };
}

export async function signUp(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });
  if (error) return { error: error.message, needsConfirmation: false };
  revalidatePath("/");
  return { error: null, needsConfirmation: !data.session };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/");
}
