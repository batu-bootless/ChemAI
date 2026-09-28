package tr.com.chemplus.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Maps request paths onto the files of the exported dashboard (public/ in the app's assets).
 *
 * <p>`next build` writes one {@code <route>/index.html} per page, and pages with an id in the URL
 * (a canvas, a conversation, a class) once under the placeholder {@code _}. The route list comes
 * from {@code public/_app/routes.json}, written by scripts/app-routes.mjs after each web build.
 */
final class AppRoutes {

    private static final String TAG = "ChemPlusRoutes";
    private static final String ASSET_ROOT = "public";
    private static final String MANIFEST = ASSET_ROOT + "/_app/routes.json";
    private static final String NOT_FOUND_PAGE = "/404.html";

    private final AssetManager assets;
    private final Set<String> pages;
    private final List<Pattern> dynamicPatterns;
    private final List<String> dynamicReplacements;
    private final Map<String, Boolean> existingFiles = new ConcurrentHashMap<>();

    private AppRoutes(AssetManager assets, Set<String> pages, List<Pattern> patterns, List<String> replacements) {
        this.assets = assets;
        this.pages = pages;
        this.dynamicPatterns = patterns;
        this.dynamicReplacements = replacements;
    }

    static AppRoutes load(Context context) {
        AssetManager assets = context.getAssets();
        Set<String> pages = new HashSet<>();
        List<Pattern> patterns = new ArrayList<>();
        List<String> replacements = new ArrayList<>();
        try (InputStream in = assets.open(MANIFEST)) {
            JSONObject manifest = new JSONObject(readUtf8(in));
            JSONArray pageList = manifest.getJSONArray("pages");
            for (int i = 0; i < pageList.length(); i++) {
                pages.add(pageList.getString(i));
            }
            JSONArray dynamic = manifest.getJSONArray("dynamic");
            for (int i = 0; i < dynamic.length(); i++) {
                JSONObject route = dynamic.getJSONObject(i);
                patterns.add(Pattern.compile(route.getString("pattern")));
                replacements.add(route.getString("replacement"));
            }
        } catch (IOException | JSONException e) {
            Log.e(TAG, "Route list missing; run the web build (npm run build:app)", e);
        }
        return new AppRoutes(
            assets,
            Collections.unmodifiableSet(pages),
            Collections.unmodifiableList(patterns),
            Collections.unmodifiableList(replacements)
        );
    }

    /**
     * Returns the path of the file to serve for {@code path}, or null to serve the request as it
     * is (existing files, Next.js bundles, Capacitor's own paths).
     */
    String resolve(String path) {
        if (path == null || path.isEmpty() || path.startsWith("/_next/") || path.startsWith("/_capacitor")) {
            return null;
        }
        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
        if (lastSegment.contains(".")) {
            if (fileExists(path)) return null;
            String mapped = mapDynamic(path);
            return mapped != null && fileExists(mapped) ? mapped : null;
        }

        String directory = path.endsWith("/") ? path : path + "/";
        if (pages.contains(directory)) return directory + "index.html";
        String mapped = mapDynamic(directory);
        if (mapped != null && pages.contains(mapped)) return mapped + "index.html";
        return NOT_FOUND_PAGE;
    }

    private String mapDynamic(String path) {
        for (int i = 0; i < dynamicPatterns.size(); i++) {
            Matcher matcher = dynamicPatterns.get(i).matcher(path);
            if (matcher.find()) {
                return matcher.replaceFirst(Matcher.quoteReplacement(dynamicReplacements.get(i)));
            }
        }
        return null;
    }

    private boolean fileExists(String path) {
        Boolean known = existingFiles.get(path);
        if (known != null) return known;
        boolean exists;
        try (InputStream ignored = assets.open(ASSET_ROOT + path)) {
            exists = true;
        } catch (IOException e) {
            exists = false;
        }
        existingFiles.put(path, exists);
        return exists;
    }

    private static String readUtf8(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
}
