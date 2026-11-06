import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
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
import { useApiFormErrors } from "@/hooks/useApiFormErrors";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormAlert, FieldError } from "@/components/patterns/FormFeedback";
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
} from "@/components/profile/profileChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { StatTile } from "@/components/patterns/StatTile";
import PageHeader from "@/components/layout/PageHeader";
import { RAILED_CARD_CLASS } from "@/components/patterns/RailedShell";

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
  error,
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
  error?: string | null;
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
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
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
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function Profile() {
  const { t } = useTranslation(["profile", "common"]);
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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showProfilePw, setShowProfilePw] = useState(false);
  const [copied, setCopied] = useState(false);

  const emailForm = useApiFormErrors();
  const passwordForm = useApiFormErrors();

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
    emailForm.clear();
    try {
      const ok = await updateProfile(email, profilePassword);
      if (ok) {
        setProfileSuccess(true);
        toast.success(t("profileUpdated"));
        setProfilePassword("");
        setEmail("");
      } else {
        const errMsg = useAuthStore.getState().error;
        if (errMsg) {
          emailForm.setFormError(errMsg);
          const wait = waitSeconds(errMsg);
          if (wait != null) {
            profileCooldown.startCooldown(wait);
          }
        }
      }
    } catch (err) {
      const extracted = emailForm.apply(err, t("updateEmailFailed"));
      const wait = waitSeconds(extracted.message);
      if (wait != null) {
        profileCooldown.startCooldown(wait);
      }
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChangingPassword(true);
    setPasswordSuccess(false);
    passwordForm.clear();
    try {
      const ok = await changePassword(
        currentPassword,
        newPassword,
        confirmPassword,
      );
      if (ok) {
        setPasswordSuccess(true);
        toast.success(t("passwordChanged"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const errMsg = useAuthStore.getState().error;
        if (errMsg) {
          passwordForm.setFormError(errMsg);
          const wait = waitSeconds(errMsg);
          if (wait != null) {
            passwordCooldown.startCooldown(wait);
          }
        }
      }
    } catch (err) {
      const extracted = passwordForm.apply(err, t("changePasswordFailed"));
      const wait = waitSeconds(extracted.message);
      if (wait != null) {
        passwordCooldown.startCooldown(wait);
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setProfileSuccess(false);
    emailForm.clearField("email");
  };

  const handleEmailPasswordChange = (value: string) => {
    setProfilePassword(value);
    setProfileSuccess(false);
    emailForm.clearField("current_password");
  };

  const handleCurrentPasswordChange = (value: string) => {
    setCurrentPassword(value);
    setPasswordSuccess(false);
    passwordForm.clearField("current_password");
  };

  const handleNewPasswordChange = (value: string) => {
    setNewPassword(value);
    setPasswordSuccess(false);
    passwordForm.clearField("new_password");
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    setPasswordSuccess(false);
    passwordForm.clearField("confirm_password");
  };

  const verifyTone = verificationTone(Boolean(user?.is_verified));
  const access = accessTone(Boolean(user?.is_admin));
  const credits = creditsTone(user?.credits ?? 0);
  const passwordTone = formTone({
    cooldown: passwordCooldown.cooldown,
    error: Boolean(passwordForm.formError),
    success: passwordSuccess,
  });
  const emailTone = formTone({
    cooldown: profileCooldown.cooldown,
    error: Boolean(emailForm.formError ?? (!passwordForm.formError ? error : null)),
    success: profileSuccess,
  });

  return (
    <div className="w-full space-y-6">
       <PageHeader title={t("title")} description={t("description")} />

      <div
        data-testid="profile-identity"
        className={RAILED_CARD_CLASS}
      >
        <SiemRail className="bg-primary" />
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/5 font-mono text-sm font-semibold tracking-wide text-primary-text"
            >
              {emailInitials(user?.email)}
            </span>
            <div className="min-w-0 space-y-2">
               <p
                 data-testid="profile-current-email"
                 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
               >
                {t("currentEmail")}
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
                    data-testid="profile-copy-email"
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void handleCopyEmail();
                    }}
                     className="h-9 w-9 shrink-0 p-0"
                     aria-label={copied ? t("copied") : t("copyEmail")}
                     title={copied ? t("copied") : t("copyEmail")}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-primary-text" />
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
                   {user?.is_verified ? t("verified") : t("unverified")}
                </Badge>
                <Badge
                  variant={user?.is_admin ? "completed" : "default"}
                  className="text-[10px]"
                >
                   {user?.is_admin ? t("admin") : t("operator")}
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
              <Link to="/credit-history">{t("creditHistory")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/workspace">{t("workspace")}</Link>
            </Button>
          </div>
        </div>
      </div>

      <div
        data-testid="profile-kpis"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatTile
          label={t("kpiVerification")}
          value={user?.is_verified ? t("verified") : t("unverified")}
          railClass={profileRailClass(verifyTone)}
          labelClassName="font-normal"
        />
        <StatTile
          label={t("kpiAccess")}
          value={user?.is_admin ? t("admin") : t("operator")}
          railClass={profileRailClass(access)}
          labelClassName="font-normal"
        />
        <StatTile
          label={t("kpiCredits")}
          value={(user?.credits ?? 0).toLocaleString()}
          railClass={profileRailClass(credits)}
          valueClassName="text-xl tracking-tight"
          labelClassName="font-normal"
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
            title={t("changePassword")}
            hint={t("changePasswordHint")}
          />
          <ProfileShellBody>
            <form
              data-testid="profile-password-form"
              onSubmit={handleChangePassword}
              className="space-y-4"
            >
              {passwordCooldown.cooldown > 0 && (
                <ProfileNotice tone="warn">
                  <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t("common:waitSeconds", {
                      seconds: passwordCooldown.cooldown,
                    })}
                  </span>
                </ProfileNotice>
              )}
              <FormAlert
                message={
                  passwordCooldown.cooldown === 0
                    ? passwordForm.formError
                    : null
                }
              />
              <PasswordField
                id="current-password"
                label={t("currentPassword")}
                value={currentPassword}
                onChange={handleCurrentPasswordChange}
                placeholder="••••••••"
                disabled={isChangingPassword}
                visible={showCurrent}
                onToggle={() => setShowCurrent((v) => !v)}
                showLabel={t("showCurrentPassword")}
                hideLabel={t("hideCurrentPassword")}
                error={passwordForm.fieldErrors.current_password}
              />
              <PasswordField
                id="new-password"
                label={t("newPassword")}
                value={newPassword}
                onChange={handleNewPasswordChange}
                placeholder={t("newPasswordPlaceholder")}
                disabled={isChangingPassword}
                visible={showNew}
                onToggle={() => setShowNew((v) => !v)}
                showLabel={t("showNewPassword")}
                hideLabel={t("hideNewPassword")}
                error={passwordForm.fieldErrors.new_password}
              />
              <PasswordField
                id="confirm-password"
                label={t("confirmNewPassword")}
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                placeholder="••••••••"
                disabled={isChangingPassword}
                visible={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
                showLabel={t("showConfirmPassword")}
                hideLabel={t("hideConfirmPassword")}
                error={passwordForm.fieldErrors.confirm_password}
              />
              <Button
                data-testid="profile-password-submit"
                type="submit"
                className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                disabled={isChangingPassword || passwordCooldown.cooldown > 0}
              >
                {passwordCooldown.cooldown > 0 ? (
                  <>
                    <Timer className="mr-2 h-4 w-4" />
                    {t("common:waitButton", {
                      seconds: passwordCooldown.cooldown,
                    })}
                  </>
                ) : isChangingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("changing")}
                  </>
                ) : (
                  t("changePassword")
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
            title={t("updateEmail")}
            hint={t("updateEmailHint")}
          />
          <ProfileShellBody>
            <form
              data-testid="profile-email-form"
              onSubmit={handleUpdateProfile}
              className="space-y-4"
            >
              {profileCooldown.cooldown > 0 && (
                <ProfileNotice tone="warn">
                  <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t("common:waitSeconds", {
                      seconds: profileCooldown.cooldown,
                    })}
                  </span>
                </ProfileNotice>
              )}
              <FormAlert
                message={
                  profileCooldown.cooldown === 0
                    ? (emailForm.formError ??
                      (!passwordForm.formError ? error : null))
                    : null
                }
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="profile-email">{t("newEmail")}</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="new@example.com"
                  required
                  disabled={isUpdatingProfile}
                  aria-invalid={Boolean(emailForm.fieldErrors.email)}
                  aria-describedby={
                    emailForm.fieldErrors.email
                      ? "profile-email-error"
                      : undefined
                  }
                />
                <FieldError
                  id="profile-email-error"
                  message={emailForm.fieldErrors.email}
                />
              </div>
              <PasswordField
                id="profile-password"
                label={t("currentPassword")}
                value={profilePassword}
                onChange={handleEmailPasswordChange}
                placeholder="••••••••"
                disabled={isUpdatingProfile}
                visible={showProfilePw}
                onToggle={() => setShowProfilePw((v) => !v)}
                showLabel={t("showEmailConfirmPassword")}
                hideLabel={t("hideEmailConfirmPassword")}
                error={emailForm.fieldErrors.current_password}
              />
              <p className="text-[10px] text-muted-foreground">
                {t("passwordRequiredToConfirm")}
              </p>
              <Button
                data-testid="profile-email-submit"
                type="submit"
                className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                disabled={isUpdatingProfile || profileCooldown.cooldown > 0}
              >
                {profileCooldown.cooldown > 0 ? (
                  <>
                    <Timer className="mr-2 h-4 w-4" />
                    {t("common:waitButton", {
                      seconds: profileCooldown.cooldown,
                    })}
                  </>
                ) : isUpdatingProfile ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("updating")}
                  </>
                ) : (
                  t("updateEmail")
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
