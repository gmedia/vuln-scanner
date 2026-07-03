import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "";

export const authApi = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export interface RegisterRequest {
  email: string;
  password: string;
  confirm_password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
  confirm_password: string;
}

export interface RefreshTokenRequest {
  refresh_token?: string;
}

export interface MessageResponse {
  message: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserResponse {
  id: string;
  email: string;
  is_verified: boolean;
  is_admin?: boolean;
  credits?: number;
  created_at: string;
}

export async function register(
  email: string,
  password: string,
  confirmPassword: string,
): Promise<MessageResponse> {
  const { data } = await authApi.post<MessageResponse>("/api/auth/register", {
    email,
    password,
    confirm_password: confirmPassword,
  });
  return data;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const { data } = await authApi.post<LoginResponse>("/api/auth/login", {
    email,
    password,
  });
  return data;
}

export async function verifyEmail(token: string): Promise<MessageResponse> {
  const { data } = await authApi.post<MessageResponse>(
    "/api/auth/verify-email",
    {
      token,
    },
  );
  return data;
}

export async function refreshToken(
  refreshToken?: string,
): Promise<LoginResponse> {
  const body: RefreshTokenRequest = refreshToken
    ? { refresh_token: refreshToken }
    : {};
  const { data } = await authApi.post<LoginResponse>("/api/auth/refresh", body);
  return data;
}

export async function forgotPassword(email: string): Promise<MessageResponse> {
  const { data } = await authApi.post<MessageResponse>(
    "/api/auth/forgot-password",
    { email },
  );
  return data;
}

export async function resetPassword(
  token: string,
  newPassword: string,
  confirmPassword: string,
): Promise<MessageResponse> {
  const { data } = await authApi.post<MessageResponse>(
    "/api/auth/reset-password",
    {
      token,
      new_password: newPassword,
      confirm_password: confirmPassword,
    },
  );
  return data;
}

export async function getMe(): Promise<UserResponse> {
  const { data } = await authApi.get<UserResponse>("/api/auth/me");
  return data;
}
