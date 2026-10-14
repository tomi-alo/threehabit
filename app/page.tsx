import { AuthForm } from "@/components/auth-form";
import { HabitBoard } from "@/components/habit-board";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="shell">
      <header className="top">
        <p className="mark">Three</p>
        <ThemeToggle />
      </header>
      {user ? <HabitBoard email={user.email ?? "Signed in"} /> : <AuthForm />}
    </main>
  );
}
