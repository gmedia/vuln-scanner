import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

function emailInitials(email: string | undefined): string {
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  const parts = local.split(/[._\-+]/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? "";
    const b = parts[1]?.[0] ?? "";
    const mark = `${a}${b}`.toUpperCase();
    if (mark) return mark;
  }
  const slice = local.slice(0, 2).toUpperCase();
  return slice || "?";
}

function waitSeconds(message: string | null): number | null {
  if (!message) return null;
  const match = message.match(/wait (\d+) seconds/i);
  if (!match?.[1]) return null;
  const seconds = parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds : null;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  visible,
  onToggle,
  showLabel,
  hideLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  visible: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="block">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          disabled={disabled}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label={visible ? hideLabel : showLabel}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-bold tabular-nums text-foreground",
          emphasize && "text-xl tracking-tight",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Profile() {
  const {
    user,
    updateProfile,
    changePassword,
    error,
    organizations,
    activeOrgId,
  } = useAuthStore();

  const [email, setEmail] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showProfilePw, setShowProfilePw] = useState(false);
  const [copied, setCopied] = useState(false);

  const profileCooldown = useRateLimitCooldown();
  const passwordCooldown = useRateLimitCooldown();

  const orgs = organizations ?? [];
  const activeOrg =
    orgs.find((org) => org.id === activeOrgId) ?? orgs[0] ?? null;

  const handleCopyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      void 0;
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileSuccess(false);
    const ok = await updateProfile(email, profilePassword);
    if (ok) {
      setProfileSuccess(true);
      toast.success("Profile updated");
      setProfilePassword("");
      setEmail("");
    }
    setIsUpdatingProfile(false);
    const errMsg = useAuthStore.getState().error;
    const wait = waitSeconds(errMsg);
    if (wait != null) {
      profileCooldown.startCooldown(wait);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChangingPassword(true);
    setPasswordSuccess(false);
    setPasswordError(null);
    const ok = await changePassword(
      currentPassword,
      newPassword,
      confirmPassword,
    );
    if (ok) {
      setPasswordSuccess(true);
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const errMsg = useAuthStore.getState().error;
      if (errMsg) {
        setPasswordError(errMsg);
        const wait = waitSeconds(errMsg);
        if (wait != null) {
          passwordCooldown.startCooldown(wait);
        }
      }
    }
    setIsChangingPassword(false);
  };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Profile"
        description="Manage your account email and password"
      />

      <article
        data-testid="profile-identity"
        className="rounded-lg border border-border bg-card"
      >
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold tracking-wide text-foreground"
            >
              {emailInitials(user?.email)}
            </span>
            <div className="min-w-0 space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Current email
              </p>
              <div className="flex min-w-0 items-center gap-1.5">
                <p
                  className="min-w-0 break-all font-mono text-sm tracking-tight text-foreground sm:text-base"
                  title={user?.email}
                >
                  {user?.email}
                </p>
                {user?.email ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void handleCopyEmail();
                    }}
                    className="h-9 w-9 shrink-0 p-0"
                    aria-label={copied ? "Copied" : "Copy email"}
                    title={copied ? "Copied" : "Copy email"}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={user?.is_verified ? "completed" : "pending"}
                  className="text-[10px]"
                >
                  {user?.is_verified ? "Verified" : "Unverified"}
                </Badge>
                <Badge
                  variant={user?.is_admin ? "completed" : "default"}
                  className="text-[10px]"
                >
                  {user?.is_admin ? "Admin" : "Operator"}
                </Badge>
                {activeOrg ? (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {activeOrg.name}
                    {activeOrg.role ? ` · ${activeOrg.role}` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/credit-history">Credit history</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/workspace">Workspace</Link>
            </Button>
          </div>
        </div>
      </article>

      <div
        data-testid="profile-kpis"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatTile
          label="Verification"
          value={user?.is_verified ? "Verified" : "Unverified"}
        />
        <StatTile label="Access" value={user?.is_admin ? "Admin" : "Operator"} />
        <StatTile
          label="Credits"
          value={(user?.credits ?? 0).toLocaleString()}
          emphasize
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-sm tracking-wide">
              Change password
            </CardTitle>
            <CardDescription className="text-xs">
              Confirm the current secret, then set a stronger one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordCooldown.cooldown > 0 && (
                <Alert>
                  <Timer />
                  <AlertDescription>
                    Too many attempts. Wait {passwordCooldown.cooldown}s
                  </AlertDescription>
                </Alert>
              )}
              {passwordError &&
                passwordCooldown.cooldown === 0 &&
                !passwordSuccess && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}
              <PasswordField
                id="current-password"
                label="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="••••••••"
                disabled={isChangingPassword}
                visible={showCurrent}
                onToggle={() => setShowCurrent((v) => !v)}
                showLabel="Show current password"
                hideLabel="Hide current password"
              />
              <PasswordField
                id="new-password"
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Min 8 chars, uppercase, lowercase, digit"
                disabled={isChangingPassword}
                visible={showNew}
                onToggle={() => setShowNew((v) => !v)}
                showLabel="Show new password"
                hideLabel="Hide new password"
              />
              <PasswordField
                id="confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="••••••••"
                disabled={isChangingPassword}
                visible={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
                showLabel="Show confirm password"
                hideLabel="Hide confirm password"
              />
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={isChangingPassword || passwordCooldown.cooldown > 0}
              >
                {passwordCooldown.cooldown > 0 ? (
                  <>
                    <Timer className="mr-2 h-4 w-4" />
                    Wait {passwordCooldown.cooldown}s
                  </>
                ) : isChangingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  "Change password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-sm tracking-wide">
              Update email
            </CardTitle>
            <CardDescription className="text-xs">
              Sign-in address. Requires the current password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {profileCooldown.cooldown > 0 && (
                <Alert>
                  <Timer />
                  <AlertDescription>
                    Too many attempts. Wait {profileCooldown.cooldown}s
                  </AlertDescription>
                </Alert>
              )}
              {error && profileCooldown.cooldown === 0 && !profileSuccess && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="profile-email" className="block">
                  New email
                </Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="new@example.com"
                  required
                  disabled={isUpdatingProfile}
                />
              </div>
              <PasswordField
                id="profile-password"
                label="Current password"
                value={profilePassword}
                onChange={setProfilePassword}
                placeholder="••••••••"
                disabled={isUpdatingProfile}
                visible={showProfilePw}
                onToggle={() => setShowProfilePw((v) => !v)}
                showLabel="Show email confirmation password"
                hideLabel="Hide email confirmation password"
              />
              <p className="text-[10px] text-muted-foreground">
                Password required to confirm
              </p>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={isUpdatingProfile || profileCooldown.cooldown > 0}
              >
                {profileCooldown.cooldown > 0 ? (
                  <>
                    <Timer className="mr-2 h-4 w-4" />
                    Wait {profileCooldown.cooldown}s
                  </>
                ) : isUpdatingProfile ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update email"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Profile;
