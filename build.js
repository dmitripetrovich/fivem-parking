import { context } from "esbuild";
import { readFileSync, writeFileSync } from "fs";

const watch = process.argv.includes("--watch");
const dry = process.argv.includes("--dry-run");

const MANIFEST_DEFAULTS = {
        fx_version: "cerulean",
        game: "gta5",
        node_version: "22",
        shared_scripts: ["@ox_lib/init.lua"],
        client_scripts: ["dist/client/*.js"],
        server_scripts: ["dist/server/*.js"],
        dependencies: ["/server:12913", "/onesync", "oxmysql", "ox_lib"],
};

function sanitize(s) {
        return s.replace(/['\n\r]/g, (c) => ({ "'": "\\'", "\n": "\\n", "\r": "\\r" })[c]);
}

function addField(lines, field, value) {
        if (value) lines.push(`${field} '${sanitize(value)}'`);
}

function addTable(lines, title, items) {
        if (!items?.length) return;
        lines.push(`\n${title} {`);
        lines.push(items.map((item) => `\t'${sanitize(item)}'`).join(",\n"));
        lines.push("}");
}

function generateManifest() {
        const pkg = JSON.parse(readFileSync("package.json", "utf8"));

        const lines = [];

        addField(lines, "fx_version", MANIFEST_DEFAULTS.fx_version);
        addField(lines, "game", MANIFEST_DEFAULTS.game);
        addField(lines, "name", pkg.name);
        addField(lines, "description", pkg.description);
        addField(lines, "author", pkg.author);
        addField(lines, "version", pkg.version);
        addField(lines, "repository", pkg.repository?.url);
        addField(lines, "node_version", MANIFEST_DEFAULTS.node_version);

        addTable(lines, "shared_scripts", MANIFEST_DEFAULTS.shared_scripts);
        addTable(lines, "client_scripts", MANIFEST_DEFAULTS.client_scripts);
        addTable(lines, "server_scripts", MANIFEST_DEFAULTS.server_scripts);
        addTable(lines, "dependencies", MANIFEST_DEFAULTS.dependencies);

        const manifest = lines.join("\n");

        if (dry) {
                console.log(manifest);
        } else {
                writeFileSync("fxmanifest.lua", manifest);
                console.log("Successfully generated fxmanifest.lua");
        }
}

async function build(development) {
        const ctx = await context({
                entryPoints: ["./client/index.ts", "./server/index.ts"],
                outdir: "./dist",
                platform: "node",
                target: "node22",
                bundle: true,
                minify: false,
                plugins: [
                        {
                                name: "build",
                                setup(build) {
                                        build.onEnd((result) => {
                                                if (result.errors.length > 0) {
                                                        console.error(`Build ended with ${result.errors.length} error(s):`);
                                                        result.errors.forEach((error, i) => console.error(`Error ${i + 1}: ${error.text}`));
                                                        return;
                                                }
                                                console.log(development ? "Successfully built (development)" : "Successfully built (production)");
                                                generateManifest();
                                        });
                                },
                        },
                ],
        });

        if (development) {
                await ctx.watch();
                console.log("Watching for changes...");
        } else {
                await ctx.rebuild();
                await ctx.dispose();
        }
}

build(watch);
