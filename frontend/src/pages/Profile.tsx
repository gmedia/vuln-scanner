import { useState, useEffect } from "react";
import { Shield, Loader2, CheckCircle, AlertCircle, Timer } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

function Profile() {
  const { user, updateProfile, changePassword, clearError, error } = useAuthStore();

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

  const profileCooldown = useRateLimitCooldown();
  const passwordCooldown = useRateLimitCooldown();

  useEffect(() => {
    if (user) {
      setEmail(user.email);
    }
    return () => {
      clearError();
    };
  }, [clearError, user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileSuccess(false);
    const ok = await updateProfile(email, profilePassword);
    if (ok) {
      setProfileSuccess(true);
      setProfilePassword("");
    }
    setIsUpdatingProfile(false);
    const errMsg = useAuthStore.getState().error;
    if (errMsg) {
      const match = errMsg.match(/wait (\d+) seconds/);
      if (match) {
        profileCooldown.startCooldown(parseInt(match[1], 10));
      }
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChangingPassword(true);
    setPasswordSuccess(false);
    setPasswordError(null);
    const ok = await changePassword(currentPassword, newPassword, confirmPassword);
    if (ok) {
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const errMsg = useAuthStore.getState().error;
      if (errMsg) {
        setPasswordError(errMsg);
        const match = errMsg.match(/wait (\d+) seconds/);
        if (match) {
          passwordCooldown.startCooldown(parseInt(match[1], 10));
        }
      }
    }
    setIsChangingPassword(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-mono text-lg tracking-wide">
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="font-mono text-xs text-muted-foreground">Current Email</p>
            <p className="font-mono text-sm text-foreground mt-1">{user?.email}</p>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-3">
            <h3 className="font-mono text-xs font-semibold text-foreground">Update Email</h3>
            {profileCooldown.cooldown > 0 && (
              <p className="font-mono text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                <Timer className="h-3 w-3" />
                Too many attempts. Wait {profileCooldown.cooldown}s
              </p>
            )}
            {profileSuccess && (
              <p className="font-mono text-xs text-green-400 text-center flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Profile updated
              </p>
            )}
            {error && profileCooldown.cooldown === 0 && !profileSuccess && (
              <p className="font-mono text-xs text-red-400 text-center flex items-center justify-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
            <div className="space-y-1">
              <label htmlFor="profile-email" className="block font-mono text-xs text-muted-foreground">
                New Email
              </label>
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
            <div className="space-y-1">
              <label htmlFor="profile-password" className="block font-mono text-xs text-muted-foreground">
                Current Password
              </label>
              <Input
                id="profile-password"
                type="password"
                value={profilePassword}
                onChange={(e) => setProfilePassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isUpdatingProfile}
              />
            </div>
            <Button
              type="submit"
              className="w-full font-mono text-sm"
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
                "Update Email"
              )}
            </Button>
          </form>

          <hr className="border-border" />

          <form onSubmit={handleChangePassword} className="space-y-3">
            <h3 className="font-mono text-xs font-semibold text-foreground">Change Password</h3>
            {passwordCooldown.cooldown > 0 && (
              <p className="font-mono text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                <Timer className="h-3 w-3" />
                Too many attempts. Wait {passwordCooldown.cooldown}s
              </p>
            )}
            {passwordSuccess && (
              <p className="font-mono text-xs text-green-400 text-center flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Password changed
              </p>
            )}
            {passwordError && passwordCooldown.cooldown === 0 && !passwordSuccess && (
              <p className="font-mono text-xs text-red-400 text-center flex items-center justify-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {passwordError}
              </p>
            )}
            <div className="space-y-1">
              <label htmlFor="current-password" className="block font-mono text-xs text-muted-foreground">
                Current Password
              </label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isChangingPassword}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-password" className="block font-mono text-xs text-muted-foreground">
                New Password
              </label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, uppercase, lowercase, digit"
                required
                disabled={isChangingPassword}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="block font-mono text-xs text-muted-foreground">
                Confirm New Password
              </label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isChangingPassword}
              />
            </div>
            <Button
              type="submit"
              className="w-full font-mono text-sm"
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
                "Change Password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default Profile;
