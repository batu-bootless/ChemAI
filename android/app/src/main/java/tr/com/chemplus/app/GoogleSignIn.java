package tr.com.chemplus.app;

import android.app.Activity;
import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * Android's "Sign in with Google" sheet (Credential Manager). The ID token goes to Supabase
 * (src/mobile/googleSignIn.ts), which accepts tokens issued for the website's Google client.
 *
 * <p>Google only issues them to an app registered in the same Google Cloud project: an "Android"
 * OAuth client with package com.chemai.app and the SHA-1 of each signing key (README).
 */
final class GoogleSignIn {

    private GoogleSignIn() {}

    static void start(Activity activity, PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        String hashedNonce = call.getString("hashedNonce");
        if (serverClientId == null || hashedNonce == null) {
            call.reject("serverClientId and hashedNonce are required.", "INVALID_REQUEST");
            return;
        }

        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId).setNonce(hashedNonce).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();

        CredentialManager.create(activity).getCredentialAsync(
            activity,
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(activity),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (
                        !(credential instanceof CustomCredential) ||
                        !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())
                    ) {
                        call.reject("Google'dan beklenmeyen bir yanıt geldi.", "INVALID_RESPONSE");
                        return;
                    }
                    try {
                        GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                        JSObject result = new JSObject();
                        result.put("idToken", google.getIdToken());
                        call.resolve(result);
                    } catch (Exception e) {
                        call.reject("Google yanıtı okunamadı.", "INVALID_RESPONSE", e);
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) {
                        call.reject("Giriş iptal edildi.", "CANCELED");
                    } else if (e instanceof NoCredentialException) {
                        call.reject(
                            "Bu cihazda kullanılabilir bir Google hesabı bulunamadı. Telefonun ayarlarından bir Google hesabı ekleyip tekrar deneyin.",
                            "NO_ACCOUNT"
                        );
                    } else if (isNotConfigured(e)) {
                        call.reject(
                            "Google ile giriş bu uygulama için henüz etkinleştirilmedi. Şimdilik e-posta ve şifrenizle giriş yapabilirsiniz.",
                            "NOT_CONFIGURED",
                            e
                        );
                    } else {
                        call.reject("Google ile giriş yapılamadı. Lütfen tekrar deneyin.", "FAILED", e);
                    }
                }
            }
        );
    }

    /** Google's answer when no Android OAuth client matches this package and signing key. */
    private static boolean isNotConfigured(GetCredentialException e) {
        String message = String.valueOf(e.getMessage());
        return message.contains("28444") || message.contains("Developer console is not set up correctly");
    }
}
