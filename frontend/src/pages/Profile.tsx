import { useState } from "react";
import { User, Loader2, AlertCircle, Timer } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

function Profile() {
  const { user, updateProfile, changePassword, error } = useAuthStore();

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
      toast.success("Password changed");
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            Profile
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Manage your account email and password
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            Identity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Current email
          </p>
          <p className="mt-1 font-mono text-sm text-foreground">{user?.email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            Update email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-3">
            {profileCooldown.cooldown > 0 && (
              <p className="flex items-center gap-1 text-xs text-amber-400">
                <Timer className="h-3 w-3" />
                Too many attempts. Wait {profileCooldown.cooldown}s
              </p>
            )}
            {error && profileCooldown.cooldown === 0 && !profileSuccess && (
              <p className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
            <div className="space-y-1">
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
            <div className="space-y-1">
              <Label htmlFor="profile-password" className="block">
                Current password
              </Label>
              <Input
                id="profile-password"
                type="password"
                value={profilePassword}
                onChange={(e) => setProfilePassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isUpdatingProfile}
              />
              <p className="text-[10px] text-muted-foreground">
                Password required to confirm
              </p>
            </div>
            <Button
              type="submit"
              className="w-full text-sm sm:w-auto"
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            {passwordCooldown.cooldown > 0 && (
              <p className="flex items-center gap-1 text-xs text-amber-400">
                <Timer className="h-3 w-3" />
                Too many attempts. Wait {passwordCooldown.cooldown}s
              </p>
            )}
            {passwordError && passwordCooldown.cooldown === 0 && !passwordSuccess && (
              <p className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                {passwordError}
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="current-password" className="block">
                Current password
              </Label>
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
              <Label htmlFor="new-password" className="block">
                New password
              </Label>
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
              <Label htmlFor="confirm-password" className="block">
                Confirm new password
              </Label>
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
              className="w-full text-sm sm:w-auto"
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
    </div>
  );
}

export default Profile;
