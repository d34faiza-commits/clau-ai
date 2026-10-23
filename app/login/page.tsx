import { Suspense } from "react";
import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";
import { authConfigured } from "@/lib/session";

export const metadata: Metadata = { title: "Login — clau-ai" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm configured={authConfigured()} />
      </Suspense>
    </div>
  );
}
