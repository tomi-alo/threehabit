export const HABIT_CAP = 3;

export type HabitPosition = 1 | 2 | 3;

export type CheckinStatus = "done" | "missed";

export type HabitRecord = {
  id: string;
  name: string;
  position: HabitPosition;
};

export type HabitOption = {
  id: string;
  name: string;
};

export type CheckinRecord = {
  habitId: string;
  status: CheckinStatus;
  missNote: string | null;
};

const POSITIONS = [1, 2, 3] as const;

export function nextPosition(positions: number[]): HabitPosition | null {
  const used = new Set(positions);
  for (const position of POSITIONS) {
    if (!used.has(position)) return position;
  }
  return null;
}

export function capMessage(count: number): string | null {
  if (count >= HABIT_CAP) {
    return "Three habits is the commitment. Tomorrow, choose again.";
  }
  return null;
}

export function normalizeHabitName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function isHabitSelected(selectedHabitIds: string[], habitId: string): boolean {
  return selectedHabitIds.includes(habitId);
}

export function missNote(note: string): string {
  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("Write one line about what got in the way.");
  }
  return trimmed;
}

export function allDoneToday(
  habitCount: number,
  checkins: { status: CheckinStatus }[],
): boolean {
  if (habitCount === 0) return false;
  const done = checkins.filter((checkin) => checkin.status === "done").length;
  return done === habitCount;
}

export function localDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function previousDay(day: string): string {
  if (!isDay(day)) throw new Error("That date is not valid.");
  const [year, month, date] = day.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, date - 1));
  return previous.toISOString().slice(0, 10);
}
