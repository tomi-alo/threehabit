"use server";

import { revalidatePath } from "next/cache";
import {
  capMessage,
  isDay,
  missNote,
  nextPosition,
  type CheckinRecord,
  type CheckinStatus,
  type HabitPosition,
  type HabitRecord,
} from "@/lib/habits";
import { createClient } from "@/lib/supabase/server";

export type Board = {
  habits: HabitRecord[];
  checkins: CheckinRecord[];
  error: string | null;
};

type HabitRow = {
  id: string;
  name: string;
  position: number;
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
    return { habits: [], checkins: [], error: "That date is not valid." };
  }

  try {
    const { supabase, user } = await requireUser();
    const { data: habitRows, error } = await supabase
      .from("habits")
      .select("id, name, position")
      .eq("user_id", user.id)
      .order("position");

    if (error) return { habits: [], checkins: [], error: error.message };

    const habits = ((habitRows ?? []) as HabitRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      position: asPosition(row.position),
    }));

    if (habits.length === 0) return { habits, checkins: [], error: null };

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
      return { habits, checkins: [], error: checkinError.message };
    }

    const checkins = ((checkinRows ?? []) as CheckinRow[]).map((row) => ({
      habitId: row.habit_id,
      status: asStatus(row.status),
      missNote: row.miss_note,
    }));

    return { habits, checkins, error: null };
  } catch (error) {
    return {
      habits: [],
      checkins: [],
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
    const { supabase, user } = await requireUser();
    const { data: existing, error } = await supabase
      .from("habits")
      .select("position")
      .eq("user_id", user.id);

    if (error) return { error: error.message, board: null };

    const rows = (existing ?? []) as { position: number }[];
    const blocked = capMessage(rows.length);
    if (blocked) return { error: blocked, board: null };

    const position = nextPosition(rows.map((row) => row.position));
    if (position === null) {
      return { error: capMessage(3), board: null };
    }

    const { error: insertError } = await supabase.from("habits").insert({
      user_id: user.id,
      name: trimmed,
      position,
    });

    if (insertError) return { error: insertError.message, board: null };
    return boardAfterChange(day, null);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not add the habit.",
      board: null,
    };
  }
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
