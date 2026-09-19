import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Fail a production build that is missing its API base URLs.
//
// These are inlined at BUILD time. `.env.production` is gitignored, so a fresh
// CI clone (Cloudflare Pages/Workers builds included) does NOT have it — and
// ~46 call sites read the var as `import.meta.env.VITE_ADMIN_API_URL ||
// 'http://localhost:5000'`. With the var unset the fallback wins, so the build
// SUCCEEDS with zero warnings while baking localhost into the shipped bundle
// and the deployed site can reach no API at all.
//
// Verified, not hypothetical: building with .env.production removed produced 39
// localhost:5000 references and 0 production-origin references, exit code 0.
// Crashing here converts that silent, deploy-time breakage into an obvious
// build failure naming the missing variable.
function assertProductionEnv(env: Record<string, string>) {
  const required = ["VITE_BASTION_API_URL", "VITE_ADMIN_API_URL"];

  // Two distinct failure modes, both of which ship a dead site:
  //
  //   unset     — CI has neither .env nor .env.production, so the ~46 call
  //               sites hit their `|| 'http://localhost:5000'` fallback.
  //   localhost — a value IS present but points at a dev address. This is the
  //               subtle one: locally, .env.production is gitignored but .env
  //               is not always absent, and loadEnv MERGES the two. Deleting
  //               .env.production therefore does not leave the vars empty — it
  //               silently leaves them as .env's localhost URLs. A presence
  //               check passes and the broken bundle still builds clean.
  const problems = required
    .map((key) => {
      const value = env[key];
      if (!value) return `${key} is not set`;
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(value)) {
        return `${key} points at a dev address (${value})`;
      }
      return null;
    })
    .filter(Boolean);

  if (problems.length > 0) {
    throw new Error(
      `Production build has bad API base URLs:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\n\nThese are inlined at build time, so the deployed site would be ` +
        `unable to reach any backend.\n` +
        `Set them in the CI/Cloudflare build environment — frontend/.env.production ` +
        `is gitignored and is NOT available to CI.`
    );
  }
}

// https://vitejs.dev/config/

export default defineConfig(({ command, mode }) => {
  // loadEnv merges .env* files with real process env, which is exactly the set
  // Vite will inline. Checking process.env alone would false-alarm locally
  // (where the values come from the gitignored .env.production file) and miss
  // nothing in CI (where they come from the build environment).
  const env = loadEnv(mode, __dirname, "VITE_");

  // Only guard real production builds; `npm run dev` and `build:dev` rely on
  // the localhost fallbacks by design.
  if (command === "build" && mode === "production") {
    assertProductionEnv(env);
  }

  return {
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
