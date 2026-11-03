"use client";

import Image from "next/image";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuthNav() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (isPending) {
    return <span style={{ fontSize: "0.85rem", color: "#888" }}>Ładowanie...</span>;
  }

  if (session && session.user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name || "Avatar"}
            width={28}
            height={28}
            unoptimized
            style={{ borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#4f46e5",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
              fontWeight: "bold",
            }}
          >
            {(session.user.name || "U")[0].toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: "0.9rem", color: "#e5e5e1", fontWeight: 500 }}>
          {session.user.name || session.user.email}
        </span>
        <button
          onClick={async () => {
            setLoading(true);
            await authClient.signOut();
            router.refresh();
            setLoading(false);
          }}
          disabled={loading}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#e5e5e1",
            padding: "0.3rem 0.6rem",
            borderRadius: "4px",
            fontSize: "0.8rem",
            cursor: "pointer",
          }}
        >
          {loading ? "Wylogowywanie..." : "Wyloguj"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {/* Logowanie przez GitHub OAuth */}
      <button
        onClick={async () => {
          setLoading(true);
          await authClient.signIn.social({
            provider: "github",
            callbackURL: "/basket",
          });
        }}
        disabled={loading}
        title="Zaloguj przez GitHub OAuth"
        style={{
          background: "#24292f",
          border: "1px solid #444",
          color: "#fff",
          padding: "0.4rem 0.85rem",
          borderRadius: "6px",
          fontSize: "0.85rem",
          fontWeight: 500,
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
        }}
      >
        <svg height="15" width="15" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        {loading ? "Łączenie z GitHub..." : "Zaloguj przez GitHub"}
      </button>
    </div>
  );
}
