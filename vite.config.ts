import { defineConfig } from "vite";
import tailwind from "@tailwindcss/vite";
import { version } from "./package.json";

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        tailwind()
    ],
    define: {
        "__VERSION__": JSON.stringify(version)
    }
});
