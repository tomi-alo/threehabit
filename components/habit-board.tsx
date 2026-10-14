"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  addHabit,
  clearCheckin,
  loadBoard,
  markDone,
  markMissed,
  selectHabit,
  signOut,
  type Board,
} from "@/app/actions";
import { allDoneToday, capMessage, localDay, type CheckinRecord } from "@/lib/habits";

function checkinFor(checkins: CheckinRecord[], habitId: string) {
  return checkins.find((checkin) => checkin.habitId === habitId) ?? null;
}

function subscribe() {
  return () => {};
}

export function HabitBoard({ email }: { email: string }) {
  const day = useSyncExternalStore(subscribe, localDay, () => "");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [missFor, setMissFor] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    let ignore = false;
    loadBoard(day).then((next) => {
      if (ignore) return;
      setBoard(next);
      setError(next.error);
    });
    return () => {
      ignore = true;
    };
  }, [day]);

  function apply(result: { error: string | null; board: Board | null }) {
    if (result.board) setBoard(result.board);
    setError(result.error ?? result.board?.error ?? null);
    if (!result.error) setMissFor(null);
    setPending(false);
  }

  async function onAdd(formData: FormData) {
    if (!day) return;
    setPending(true);
    setError(null);
    apply(await addHabit(String(formData.get("name") ?? ""), day));
  }

  async function onSelect(habitId: string) {
    if (!day) return;
    setPending(true);
    setError(null);
    apply(await selectHabit(habitId, day));
  }

  const habits = board?.habits ?? [];
  const checkins = board?.checkins ?? [];
  const suggestions = board?.suggestions ?? [];
  const library = board?.library ?? [];
  const blocked = capMessage(habits.length);
  const finished = allDoneToday(habits.length, checkins);

  return (
    <section className="panel">
      <div className="board-top">
        <div>
          <h1>Today</h1>
          <p className="lede">{day ?? "Loading today…"}</p>
        </div>
        <div className="who">
          <span>{email}</span>
          <button
            type="button"
            className="text"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {finished ? <p className="done-banner">Every commitment is done today.</p> : null}
      {error ? <p className="message">{error}</p> : null}

      {board && habits.length === 0 ? (
        <p className="empty">
          Choose up to three things for today. Once chosen, they stay for the day.
        </p>
      ) : null}

      <ol className="habits">
        {habits.map((habit) => {
          const checkin = checkinFor(checkins, habit.id);
          return (
            <li key={habit.id} className={checkin ? `habit ${checkin.status}` : "habit"}>
              <div className="habit-row">
                <span className="index">0{habit.position}</span>
                <span className="name">{habit.name}</span>
                <span className="locked">Locked today</span>
                <span className="actions">
                  <button
                    type="button"
                    disabled={pending || !day}
                    onClick={() => {
                      if (!day) return;
                      setPending(true);
                      const action =
                        checkin?.status === "done"
                          ? clearCheckin(habit.id, day)
                          : markDone(habit.id, day);
                      void action.then(apply);
                    }}
                  >
                    {checkin?.status === "done" ? "Done" : "Mark done"}
                  </button>
                  <button
                    type="button"
                    disabled={pending || !day}
                    onClick={() => setMissFor(missFor === habit.id ? null : habit.id)}
                  >
                    Missed
                  </button>
                </span>
              </div>
              {checkin?.status === "missed" && checkin.missNote ? (
                <p className="note">{checkin.missNote}</p>
              ) : null}
              {missFor === habit.id ? (
                <form
                  className="miss-form"
                  action={(formData) => {
                    if (!day) return;
                    setPending(true);
                    void markMissed(habit.id, day, String(formData.get("note") ?? "")).then(
                      apply,
                    );
                  }}
                >
                  <label>
                    What got in the way?
                    <input name="note" required defaultValue={checkin?.missNote ?? ""} />
                  </label>
                  <button type="submit" className="primary" disabled={pending}>
                    Save note
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>

      {blocked ? (
        <p className="message">{blocked}</p>
      ) : (
        <div className="chooser">
          {suggestions.length > 0 ? (
            <div>
              <p className="chooser-title">Yesterday’s choices</p>
              <div className="suggestions">
                {suggestions.map((habit) => (
                  <button
                    key={habit.id}
                    type="button"
                    disabled={pending || !day}
                    onClick={() => void onSelect(habit.id)}
                  >
                    Choose {habit.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {library.length > 0 ? (
            <form
              className="add-form"
              action={(formData) => {
                void onSelect(String(formData.get("habitId") ?? ""));
              }}
            >
              <label>
                Choose an old habit
                <select name="habitId" defaultValue="" required>
                  <option value="" disabled>
                    Select a habit
                  </option>
                  {library.map((habit) => (
                    <option key={habit.id} value={habit.id}>
                      {habit.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="primary" disabled={pending || !day}>
                Choose
              </button>
            </form>
          ) : null}

          <form action={onAdd} className="add-form">
            <label>
              Add a new habit
              <input name="name" maxLength={80} required placeholder="One thing you will do" />
            </label>
            <button type="submit" className="primary" disabled={pending || !day}>
              Choose
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
