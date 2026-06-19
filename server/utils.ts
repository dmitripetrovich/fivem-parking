import type Raw from "../../static/config.json";

export type Config = typeof Raw;

export const Config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), "static/config.json")) as Config;

export function getPlayerLicense(source: number): string | null {
        return GetPlayerIdentifierByType(String(source), "license2") || null;
}

export function getPlayerDisplayName(source: number): string {
        return GetPlayerName(String(source)) ?? String(source);
}

export function notify(source: number, description: string, type: 'error' | 'success' | 'info' | 'warning' = 'info') {
        TriggerClientEvent('ox_lib:notify', source, { description, type });
}

export function isInArea(coords: { x: number; y: number; z: number }, areas: { x: number; y: number; z: number; radius: number }[]) {
        return areas.some((area) => {
                const distance = Math.sqrt((coords.x - area.x) ** 2 + (coords.y - area.y) ** 2 + (coords.z - area.z) ** 2);
                return distance <= area.radius;
        });
}

export function isValidPlate(plate: string): boolean {
        return (typeof plate === "string" && plate.length >= 1 && plate.length <= 8 && /^[A-Z0-9]+$/.test(plate));
}

export function isValidModelName(model: string): boolean {
        return (typeof model === "string" && model.length >= 1 && model.length <= 30 && /^[a-zA-Z0-9_]+$/.test(model));
}

const PREFIX = "https://discord.com/api/webhooks/";
const WEBHOOK_TIMEOUT_MS = 5000;

export async function sendLog(message: string) {
        if (!Config.Webhook || !Config.Webhook.startsWith(PREFIX)) return;
        const date = new Date();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
        try {
                await fetch(Config.Webhook, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                                username: GetCurrentResourceName(),
                                content: `**[${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}]** ${message}`,
                        }),
                        signal: controller.signal,
                });
        } catch {
                // ignore
        } finally {
                clearTimeout(timeout);
        }
}
