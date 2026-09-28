package tr.com.chemplus.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/** Saves the dashboard's downloads (reports, exports, attachments) and opens or shares them. */
final class Files {

    private static final String FOLDER = "ChemAI";

    private Files() {}

    /** Saves to Downloads/Chem+ (Android 10+), or to the app's own Downloads folder before that. */
    static JSObject save(Context context, String fileName, String mimeType, String base64) throws IOException {
        byte[] bytes;
        try {
            bytes = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            throw new IOException("Invalid file data", e);
        }
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? saveToDownloads(context, fileName, mimeType, bytes)
            : saveToAppFolder(context, fileName, bytes);
    }

    private static JSObject saveToDownloads(Context context, String fileName, String mimeType, byte[] bytes) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Downloads folder is not available");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Cannot write " + uri);
            out.write(bytes);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        // Android renames duplicates ("rapor (1).pdf").
        return result(uri, context.getString(R.string.downloads_folder) + "/" + FOLDER + "/" + displayName(resolver, uri, fileName));
    }

    private static JSObject saveToAppFolder(Context context, String fileName, byte[] bytes) throws IOException {
        File folder = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FOLDER);
        if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Cannot create " + folder);
        File file = uniqueFile(folder, fileName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        return result(uri, "ChemAI/" + file.getName());
    }

    static void open(Context context, Uri uri, String mimeType) throws ActivityNotFoundException {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, mimeType);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    static void share(Context context, Uri uri, String mimeType, String title) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.setClipData(ClipData.newRawUri(title, uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, context.getString(R.string.share_file_title));
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(chooser);
    }

    /** Only files this app saved may be opened or shared from JavaScript. */
    static boolean isOwnFile(Context context, Uri uri) {
        if (uri == null || !ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) return false;
        String authority = uri.getAuthority();
        return MediaStore.AUTHORITY.equals(authority) || (context.getPackageName() + ".fileprovider").equals(authority);
    }

    private static String displayName(ContentResolver resolver, Uri uri, String fallback) {
        try (Cursor cursor = resolver.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null) return name;
            }
        } catch (RuntimeException ignored) {
            // The file is saved; only the shown name may be off.
        }
        return fallback;
    }

    private static File uniqueFile(File folder, String fileName) {
        File file = new File(folder, fileName);
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String ext = dot > 0 ? fileName.substring(dot) : "";
        for (int i = 1; file.exists(); i++) {
            file = new File(folder, base + " (" + i + ")" + ext);
        }
        return file;
    }

    private static JSObject result(Uri uri, String location) {
        JSObject result = new JSObject();
        result.put("uri", uri.toString());
        result.put("location", location);
        return result;
    }
}
