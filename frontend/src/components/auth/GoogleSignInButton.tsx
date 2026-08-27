import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getGoogleAuthConfig } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential?: string }) => void;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (moment?: (n: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
            isDismissedMoment: () => boolean;
          }) => void) => void;
        };
      };
    };
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("gis-load-failed")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis-load-failed"));
    document.head.appendChild(script);
  });
}

function GoogleMark() {
  return (
    <svg aria-hidden className="size-4 shrink-0" viewBox="0 0 24 24">
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
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GoogleSignInButton() {
  const { t } = useTranslation("auth");
  const loginWithGoogleToken = useAuthStore((s) => s.loginWithGoogleToken);
  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [gisError, setGisError] = useState("");
  const [busy, setBusy] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getGoogleAuthConfig()
      .then((cfg) => {
        if (!cancelled && cfg.enabled && cfg.client_id) {
          setEnabled(true);
          setClientId(cfg.client_id);
        }
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !clientId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await loadGis();
        if (cancelled) {
          return;
        }
        const id = window.google?.accounts?.id;
        if (!id) {
          setGisError(t("googleUnavailable"));
          return;
        }
        id.initialize({
          client_id: clientId,
          cancel_on_tap_outside: true,
          callback: (res) => {
            const cred = res.credential;
            setBusy(false);
            if (!cred) {
              return;
            }
            void loginWithGoogleToken(cred);
          },
        });
        readyRef.current = true;
        setGisError("");
      } catch {
        if (!cancelled) {
          readyRef.current = false;
          setGisError(t("googleUnavailable"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, clientId, loginWithGoogleToken, t]);

  const onClick = () => {
    const id = window.google?.accounts?.id;
    if (!id || !readyRef.current) {
      setGisError(t("googleUnavailable"));
      return;
    }
    setGisError("");
    setBusy(true);
    id.prompt((notification) => {
      if (
        notification.isNotDisplayed() ||
        notification.isSkippedMoment() ||
        notification.isDismissedMoment()
      ) {
        setBusy(false);
      }
    });
  };

  if (!enabled) {
    return null;
  }

  return (
    <div className="mb-4 space-y-3" data-testid="google-sign-in">
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        data-testid="google-sign-in-btn"
        disabled={busy}
        onClick={onClick}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />}
        {busy ? t("googleSigningIn") : t("continueWithGoogle")}
      </Button>
      {gisError ? (
        <p className="text-center text-xs text-destructive">{gisError}</p>
      ) : null}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("orEmail")}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

export default GoogleSignInButton;
