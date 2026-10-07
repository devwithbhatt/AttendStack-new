import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../api/client";
import { colors, fonts, radii } from "../theme";
import { PrimaryButton } from "../components/PrimaryButton";
import { ErrorBanner } from "../components/ErrorBanner";

const RESEND_SECONDS = 60;

/** "Forgot password?" on the sign-in card: email → 6-digit code + new
 * password. Same endpoints as the web Forgot Password page, so it also
 * works for a new employee setting their first password from the welcome
 * email. */
export function ForgotPasswordStep({ initialEmail, onDone, onBack }: { initialEmail: string; onDone: (email: string) => void; onBack: () => void }) {
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter the email address you sign in with.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<{ detail?: string }>("/accounts/password-reset/request/", { email: email.trim() });
      setInfo(data?.detail || "If an account exists for this email, a 6-digit code has been sent.");
      setStep("reset");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not send the code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    setError("");
    if (!/^\d{6}$/.test(otp)) return setError("Enter the 6-digit code from the email.");
    if (password.length < 8) return setError("Use at least 8 characters for the new password.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    try {
      await api.post("/accounts/password-reset/confirm/", { email: email.trim(), otp, new_password: password, confirm_password: confirm });
      onDone(email.trim());
    } catch (err) {
      setError(extractErrorMessage(err, "Could not reset the password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Feather name="key" size={22} color={colors.primaryDark} />
        </View>
        <Text style={styles.title}>{step === "email" ? "Forgot password?" : "Set a new password"}</Text>
        <Text style={styles.subtitle}>
          {step === "email" ? "We'll email you a 6-digit code to set a new password." : `Enter the code sent to ${email.trim()}.`}
        </Text>
      </View>

      {info && step === "reset" ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{info}</Text>
        </View>
      ) : null}
      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      {step === "email" ? (
        <>
          <Text style={styles.label}>Email address</Text>
          <View style={styles.inputWrap}>
            <Feather name="mail" size={16} color={colors.muted} style={{ marginRight: 8 }} />
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
          <PrimaryButton title="Send Code" onPress={requestCode} loading={loading} style={{ marginTop: 20 }} />
        </>
      ) : (
        <>
          <Text style={styles.label}>Verification code</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, styles.otp]}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="••••••"
              placeholderTextColor={colors.placeholder}
              maxLength={6}
            />
          </View>
          <Text style={styles.label}>New password</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!show}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity onPress={() => setShow((v) => !v)} hitSlop={10}>
              <Feather name={show ? "eye-off" : "eye"} size={16} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>Confirm new password</Text>
          <View style={styles.inputWrap}>
            <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry={!show} placeholder="Repeat it" placeholderTextColor={colors.placeholder} />
          </View>
          <PrimaryButton title="Reset Password" onPress={reset} loading={loading} style={{ marginTop: 20 }} />
          <TouchableOpacity onPress={requestCode} disabled={cooldown > 0 || loading} style={{ marginTop: 14, alignSelf: "center" }}>
            <Text style={[styles.link, cooldown > 0 && { color: colors.muted }]}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={onBack} style={{ marginTop: 18, alignSelf: "center" }}>
        <Text style={styles.link}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", marginBottom: 22 },
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#e6f7f1", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 6, textAlign: "center" },
  infoBox: { backgroundColor: colors.infoSoftBg, borderWidth: 1, borderColor: colors.infoSoftBorder, borderRadius: radii.md, padding: 12, marginBottom: 16 },
  infoText: { fontSize: 12, fontFamily: fonts.regular, color: colors.infoSoftText },
  label: { fontSize: 13, fontFamily: fonts.medium, color: colors.text, marginBottom: 6, marginTop: 12 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 14, backgroundColor: "#fff" },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: fonts.regular, color: colors.text },
  otp: { letterSpacing: 8, fontFamily: fonts.bold, fontSize: 20, textAlign: "center" },
  link: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.primaryDark },
});
