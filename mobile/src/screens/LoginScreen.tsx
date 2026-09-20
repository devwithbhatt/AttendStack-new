import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, radii } from "../theme";
import { PrimaryButton } from "../components/PrimaryButton";
import { ErrorBanner } from "../components/ErrorBanner";

const RESEND_SECONDS = 60;

function OtpStep({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const { verifyTwoFactorOtp, resendTwoFactorOtp } = useAuth();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async () => {
    setError("");
    setInfo("");
    if (otp.trim().length !== 6) {
      setError("Enter the 6-digit code sent to your email.");
      return;
    }
    setLoading(true);
    try {
      await verifyTwoFactorOtp(otp.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify the code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResending(true);
    try {
      await resendTwoFactorOtp();
    } finally {
      setInfo("If needed, a new code has been sent to your email.");
      setCooldown(RESEND_SECONDS);
      setResending(false);
    }
  };

  return (
    <>
      <View style={styles.logoWrap}>
        <Text style={styles.title}>Verify your identity</Text>
        <Text style={[styles.subtitle, { textAlign: "center" }]}>
          Enter the 6-digit code sent to {"\n"}
          <Text style={{ fontFamily: fonts.semiBold, color: colors.text }}>{email}</Text>
        </Text>
      </View>

      <ErrorBanner message={error} style={{ marginBottom: 16 }} />
      {!error && !!info && (
        <View style={[stylesOtp.infoBox, { marginBottom: 16 }]}>
          <Text style={stylesOtp.infoText}>{info}</Text>
        </View>
      )}

      <Text style={styles.label}>Verification code</Text>
      <View style={styles.inputWrap}>
        <Feather name="shield" size={16} color={colors.muted} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, stylesOtp.otpInput]}
          value={otp}
          onChangeText={(text) => setOtp(text.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          placeholder="123456"
          placeholderTextColor={colors.placeholder}
          maxLength={6}
          autoFocus
        />
      </View>
      <Text style={stylesOtp.hint}>Code expires in 5 minutes.</Text>

      <PrimaryButton title="Verify & Continue" onPress={handleVerify} loading={loading} style={{ marginTop: 24 }} />

      <View style={stylesOtp.row}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Text style={stylesOtp.link}>Back to sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || resending} hitSlop={10}>
          <Text style={[stylesOtp.link, (cooldown > 0 || resending) && stylesOtp.linkDisabled]}>
            {resending ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function LoginScreen() {
  const { login, pendingTwoFactorEmail, cancelTwoFactor } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={require("../../assets/login-bg.jpg")} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {pendingTwoFactorEmail ? (
              <OtpStep
                email={pendingTwoFactorEmail}
                onBack={() => {
                  cancelTwoFactor();
                  setPassword("");
                  setError("");
                }}
              />
            ) : (
              <>
                <View style={styles.logoWrap}>
                  <Image source={require("../../assets/brand-logo.png")} style={styles.logo} />
                  <Text style={styles.title}>AttendStack</Text>
                  <Text style={styles.subtitle}>Sign in to your account</Text>
                </View>

                <ErrorBanner message={error} style={{ marginBottom: 16 }} />

                <Text style={styles.label}>Email address</Text>
                <View style={styles.inputWrap}>
                  <Feather name="mail" size={16} color={colors.muted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="you@company.com"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>

                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrap}>
                  <Feather name="lock" size={16} color={colors.muted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="Password"
                    placeholderTextColor={colors.placeholder}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.muted} />
                  </TouchableOpacity>
                </View>

                <PrimaryButton title="Sign In" onPress={handleSubmit} loading={loading} style={{ marginTop: 24 }} />

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    AttendStack is a <Text style={styles.footerBrand}>Bhatt Square</Text> project.
                  </Text>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(241, 245, 249, 0.86)",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    borderRadius: radii.xl,
    padding: 28,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 28,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    marginBottom: 14,
    resizeMode: "contain",
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    color: colors.text,
    marginBottom: 6,
    marginTop: 14,
    fontFamily: fonts.medium,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    gap: 10,
  },
  inputIcon: { marginTop: 1 },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 24,
    paddingTop: 16,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  footerBrand: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
});

const stylesOtp = StyleSheet.create({
  otpInput: {
    letterSpacing: 8,
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    marginTop: 6,
  },
  infoBox: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: radii.md,
    padding: 12,
  },
  infoText: {
    color: "#1d4ed8",
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  link: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  linkDisabled: {
    color: colors.muted,
  },
});
