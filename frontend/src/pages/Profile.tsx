import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ProfileIconChip,
  ProfileNotice,
  ProfileShell,
  ProfileShellBody,
  ProfileShellHead,
} from "@/components/profile/ProfileShell";
import {
  accessTone,
  creditsTone,
  formTone,
  profileRailClass,
  verificationTone,
  type ProfileTone,
} from "@/components/profile/profileChrome";
import { SiemRail } from "@/components/siem/siemChrome";
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
      <Label htmlFor={id}>{label}</Label>
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
  tone = "primary",
  emphasize = false,
}: {
  label: string;
  value: ReactNode;
  tone?: ProfileTone;
  emphasize?: boolean;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4">
      <SiemRail className={profileRailClass(tone)} />
      <p className="pl-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "mt-1 pl-2 font-mono text-lg font-bold tabular-nums text-foreground",
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

  const verifyTone = verificationTone(Boolean(user?.is_verified));
  const access = accessTone(Boolean(user?.is_admin));
  const credits = creditsTone(user?.credits ?? 0);
  const passwordTone = formTone({
    cooldown: passwordCooldown.cooldown,
    error: Boolean(passwordError),
    success: passwordSuccess,
  });
  const emailTone = formTone({
    cooldown: profileCooldown.cooldown,
    error: Boolean(error),
    success: profileSuccess,
  });

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Profile"
        description="Manage your account email and password"
      />

      <div
        data-testid="profile-identity"
        className="relative overflow-hidden rounded-lg border border-border bg-card pl-4"
      >
        <SiemRail className="bg-primary" />
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/5 font-mono text-sm font-semibold tracking-wide text-primary"
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
      </div>

      <div
        data-testid="profile-kpis"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatTile
          label="Verification"
          value={user?.is_verified ? "Verified" : "Unverified"}
          tone={verifyTone}
        />
        <StatTile
          label="Access"
          value={user?.is_admin ? "Admin" : "Operator"}
          tone={access}
        />
        <StatTile
          label="Credits"
          value={(user?.credits ?? 0).toLocaleString()}
          tone={credits}
          emphasize
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ProfileShell tone={passwordTone}>
          <ProfileShellHead
            icon={
              <ProfileIconChip>
                <KeyRound className="h-4 w-4" />
              </ProfileIconChip>
            }
            title="Change password"
            hint="Confirm the current secret, then set a stronger one."
          />
          <ProfileShellBody>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordCooldown.cooldown > 0 && (
                <ProfileNotice tone="warn">
                  <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Too many attempts. Wait {passwordCooldown.cooldown}s
                  </span>
                </ProfileNotice>
              )}
              {passwordError &&
                passwordCooldown.cooldown === 0 &&
                !passwordSuccess && (
                  <ProfileNotice tone="danger" role="alert">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{passwordError}</span>
                  </ProfileNotice>
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
                className="min-h-11 w-full sm:min-h-10 sm:w-auto"
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
          </ProfileShellBody>
        </ProfileShell>

        <ProfileShell tone={emailTone}>
          <ProfileShellHead
            icon={
              <ProfileIconChip>
                <Mail className="h-4 w-4" />
              </ProfileIconChip>
            }
            title="Update email"
            hint="Sign-in address. Requires the current password."
          />
          <ProfileShellBody>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {profileCooldown.cooldown > 0 && (
                <ProfileNotice tone="warn">
                  <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Too many attempts. Wait {profileCooldown.cooldown}s
                  </span>
                </ProfileNotice>
              )}
              {error && profileCooldown.cooldown === 0 && !profileSuccess && (
                <ProfileNotice tone="danger" role="alert">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </ProfileNotice>
              )}
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="profile-email">New email</Label>
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
                className="min-h-11 w-full sm:min-h-10 sm:w-auto"
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
          </ProfileShellBody>
        </ProfileShell>
      </div>
    </div>
  );
}

export default Profile;
