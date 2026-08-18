"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/firebase/auth";

export function AuthWall() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return (
      <div className="auth-wall-overlay">
        <div className="auth-card">
          <div className="spinner-orbit" />
          <p style={{ marginTop: "16px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.06em" }}>
            INITIALIZING SESSION…
          </p>
        </div>
      </div>
    );
  }

  if (user) return null; // Logged in, show game!

  const handleLogin = async () => {
    setSigningIn(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error("Login failed:", err);
      setError("Gagal masuk dengan Google. Pastikan popup tidak diblokir oleh browser.");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="auth-wall-overlay">
      <div className="auth-card">
        <div className="auth-badge">RIFF//LAB · CLOUD ACCESS</div>
        <h2>Sign In to RIFF//LAB</h2>
        <p className="auth-desc">
          Masuk dengan akun <strong>Google</strong> untuk mengakses katalog cloud 120.000+ lagu, global leaderboards, dan sinkronisasi lirik.
        </p>

        <div className="auth-features-list">
          <div className="auth-feature-item">
            <span aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.45.98-.98 1.05A6 6 0 0 1 8 18h8a6 6 0 0 1-1.02-.05c-.53-.07-.98-.5-.98-1.05v-2.34" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </span>
            <div>
              <strong>Global Leaderboard</strong>
              <small>Simpan high score & rekor performa di seluruh dunia.</small>
            </div>
          </div>
          <div className="auth-feature-item">
            <span aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </span>
            <div>
              <strong>Chorus Cloud Streaming</strong>
              <small>Streaming langsung 120.000+ lagu komunitas tanpa unduh manual.</small>
            </div>
          </div>
          <div className="auth-feature-item">
            <span aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <div>
              <strong>Real-time Multiplayer</strong>
              <small>Duel 1v1 dan Band Co-op (Lead + Bass) bersama teman secara online.</small>
            </div>
          </div>
        </div>

        {error && <div className="auth-error-pill">{error}</div>}

        <button
          type="button"
          className="google-login-btn"
          disabled={signingIn}
          onClick={handleLogin}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{signingIn ? "Menghubungkan…" : "Lanjutkan dengan Google"}</span>
        </button>

        <small className="auth-privacy-note">
          Data akun hanya digunakan untuk identitas profil & papan peringkat.
        </small>
      </div>
    </div>
  );
}

