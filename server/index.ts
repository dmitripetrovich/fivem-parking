import { onClientCallback } from "@overextended/ox_lib/server";
import "./commands";
import { getVehicleByPlate, getOwnedVehicles, countAllVehicles, resetOutsideVehicles, setVehicleStatus, type VehicleStatus } from "./db";
import { garage } from "./garage/class";

on("onResourceStart", async (resourceName: string) => {
        if (resourceName !== GetCurrentResourceName()) return;
        const [reset, total] = await Promise.all([resetOutsideVehicles(), countAllVehicles()]);
        console.log(`Loaded ${total} vehicle(s).`);
        if (reset > 0) console.log(`Reset ${reset} ghost vehicle(s) to stored.`);
});

on("onResourceStop", (resourceName: string) => {
        if (resourceName !== GetCurrentResourceName()) return;
        garage.cleanupSpawnedEntities();
});

on("playerDropped", () => {
        garage.clearCooldown(source);
});

exports("impoundVehicle", async (plate: string): Promise<boolean> => {
        if (typeof plate !== "string" || !plate) return false;
        const vehicle = await getVehicleByPlate(plate.trim());
        if (!vehicle) return false;
        await setVehicleStatus(vehicle.id, "impound");
        return true;
});

exports("getVehicleByPlate", async (plate: string) => {
        if (typeof plate !== "string" || !plate) return null;
        return getVehicleByPlate(plate.trim());
});

exports("getPlayerVehicles", async (license: string) => {
        if (typeof license !== "string" || !license) return [];
        return getOwnedVehicles(license.trim());
});

exports("setVehicleStatus", async (plate: string, status: string): Promise<boolean> => {
        if (typeof plate !== "string" || !plate) return false;
        if (!["stored", "outside", "impound"].includes(status)) return false;
        const vehicle = await getVehicleByPlate(plate.trim());
        if (!vehicle) return false;
        await setVehicleStatus(vehicle.id, status as VehicleStatus);
        return true;
});

exports("isVehicleOutside", async (plate: string): Promise<boolean> => {
        if (typeof plate !== "string" || !plate) return false;
        const vehicle = await getVehicleByPlate(plate.trim());
        if (!vehicle) return false;
        return vehicle.stored === "outside";
});

onClientCallback("fivem-parking:server:returnVehicle", async (src: number, vehicleId: number) => {
        return garage.returnVehicle(src, { vehicleId });
});

onClientCallback("fivem-parking:server:spawnVehicle", async (src: number, vehicleId: number) => {
        return garage.spawnVehicle(src, { vehicleId });
});
