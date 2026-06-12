import * as Cfx from "@nativewrappers/fivem";
import { triggerClientCallback, setVehicleProperties, VehicleProperties } from "@overextended/ox_lib/server";
import { Config, getArea, getPlayerDisplayName, getPlayerLicense, isValidModelName, isValidPlate, notify, sendLog } from "../utils";
import { getVehicle, getVehicleByPlate, getOwnedVehicles, countOwnedVehicles, plateExists, setVehicleStatus, setVehicleStatusAtomic, insertVehicle, updateVehicleType, getVehicleProperties, saveVehicleProperties, deleteVehicle, Vehicle, VehicleStatus } from "../db";

const PLATE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export class Garage {
        private spawnedEntities = new Map<number, number>();
        private vehicleCache = new Map<string, Vehicle[]>();

        constructor() {
                on("entityRemoved", async (entity: number) => {
                        const vehicleId = this.spawnedEntities.get(entity);
                        if (vehicleId === undefined) return;
                        this.spawnedEntities.delete(entity);
                        await setVehicleStatusAtomic(vehicleId, "stored", "outside");
                });
        }

        private updateCacheStatus(license: string, vehicleId: number, status: VehicleStatus) {
                const cached = this.vehicleCache.get(license);
                if (!cached) return;
                const vehicle = cached.find(v => v.id === vehicleId);
                if (vehicle) vehicle.stored = status;
        }

        public clearPlayerCache(license: string) {
                this.vehicleCache.delete(license);
        }

        private async generateUniquePlate(): Promise<string> {
                for (let i = 0; i < 10; i++) {
                        const plate = Array.from({ length: 8 }, () => PLATE_CHARS[Math.floor(Math.random() * PLATE_CHARS.length)]).join("");
                        if (!(await plateExists(plate))) return plate;
                }
                for (let i = 0; i < 10; i++) {
                        const base = Array.from({ length: 6 }, () => PLATE_CHARS[Math.floor(Math.random() * PLATE_CHARS.length)]).join("");
                        const plate = (base + Date.now().toString(36).slice(-2)).toUpperCase().slice(0, 8);
                        if (!(await plateExists(plate))) return plate;
                }
                throw new Error("Failed to generate a unique plate after 20 attempts.");
        }

        public async listVehicles(source: number) {
                const license = getPlayerLicense(source);
                if (!license) return [];

                const vehicles = await getOwnedVehicles(license);
                if (!vehicles || vehicles.length === 0) {
                        notify(source, "You do not own any vehicles!", "error");
                        return [];
                }

                this.vehicleCache.set(license, vehicles);
                triggerClientCallback("fivem-parking:client:listVehicles", source, vehicles);
                return vehicles;
        }

        public async parkVehicle(source: number): Promise<boolean> {
                const license = getPlayerLicense(source);
                if (!license) return false;

                const ped = GetPlayerPed(source);
                if (ped === 0) return false;

                const entity = GetVehiclePedIsIn(ped, false);
                if (entity === 0) {
                        notify(source, "You are not inside of a vehicle!", "error");
                        return false;
                }

                if (GetPedInVehicleSeat(entity, -1) !== ped) {
                        notify(source, "You must be the driver to park!", "error");
                        return false;
                }

                const plate = GetVehicleNumberPlateText(entity).trim();
                if (!isValidPlate(plate)) {
                        notify(source, "This vehicle has an invalid plate number.", "error");
                        return false;
                }

                const cached = this.vehicleCache.get(license);
                const vehicle = cached?.find(v => v.plate === plate) ?? await getVehicleByPlate(plate);

                if (!vehicle) {
                        notify(source, "This vehicle is not registered in the system.", "error");
                        return false;
                }

                if (vehicle.owner !== license) {
                        notify(source, "You are not the owner of this vehicle!", "error");
                        return false;
                }

                if (vehicle.stored !== "outside") {
                        notify(source, "This vehicle cannot be parked.", "error");
                        return false;
                }

                // Add your inventory check here before deducting (Config.Garage.StoreCost is the amount).
                // Add your money deduction here.

                const vehicleType = GetVehicleType(entity);
                if (vehicleType && vehicleType !== vehicle.type) {
                        await updateVehicleType(vehicle.id, vehicleType);
                }

                const props = await triggerClientCallback<VehicleProperties | null>("fivem-parking:client:getVehicleProperties", source);
                if (props) {
                        await saveVehicleProperties(vehicle.id, JSON.stringify(props));
                }

                const parked = await setVehicleStatusAtomic(vehicle.id, "stored", "outside");
                if (!parked) {
                        notify(source, "This vehicle cannot be parked.", "error");
                        return false;
                }

                this.updateCacheStatus(license, vehicle.id, "stored");
                this.spawnedEntities.delete(entity);
                DeleteEntity(entity);

                notify(source, "Successfully parked vehicle.", "success");
                const coords = GetEntityCoords(ped, true);
                await sendLog(`[VEHICLE] ${getPlayerDisplayName(source)} (${source}) parked vehicle #${vehicle.id} (${vehicle.model}) [${vehicle.plate}] at ${coords[0].toFixed(2)} ${coords[1].toFixed(2)} ${coords[2].toFixed(2)}.`);

                return true;
        }

        public async spawnVehicle(source: number, args: { vehicleId: number }): Promise<boolean> {
                const license = getPlayerLicense(source);
                if (!license) return false;

                const { vehicleId } = args;
                if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
                        notify(source, "Invalid vehicle ID.", "error");
                        return false;
                }

                const cached = this.vehicleCache.get(license);
                const vehicle = cached?.find(v => v.id === vehicleId) ?? await getVehicle(vehicleId);

                if (!vehicle || vehicle.owner !== license) {
                        notify(source, "Something went wrong.", "error");
                        return false;
                }

                if (vehicle.stored !== "stored") {
                        notify(source, "Vehicle is not in storage!", "error");
                        return false;
                }

                // Add your inventory check here before deducting (Config.Garage.RetrieveCost is the amount).
                // Add your money deduction here.

                const ped = GetPlayerPed(source);
                if (ped === 0) {
                        notify(source, "Could not find your character.", "error");
                        return false;
                }

                const reserved = await setVehicleStatusAtomic(vehicleId, "outside", "stored");
                if (!reserved) {
                        notify(source, "Vehicle is not in storage!", "error");
                        return false;
                }

                this.updateCacheStatus(license, vehicleId, "outside");

                const coords = GetEntityCoords(ped, true);
                const heading = GetEntityHeading(ped);
                const rad = (heading * Math.PI) / 180;
                const spawnX = coords[0] + Math.sin(-rad) * 5;
                const spawnY = coords[1] + Math.cos(-rad) * 5;

                const entity = CreateVehicleServerSetter(GetHashKey(vehicle.model), vehicle.type || "automobile", spawnX, spawnY, coords[2] + 1, heading);
                if (!entity) {
                        await setVehicleStatus(vehicleId, "stored");
                        this.updateCacheStatus(license, vehicleId, "stored");
                        notify(source, "Failed to spawn the vehicle.", "error");
                        return false;
                }

                this.spawnedEntities.set(entity, vehicleId);
                SetVehicleNumberPlateText(entity, vehicle.plate);

                let waited = 0;
                while (!DoesEntityExist(entity) && waited < 3000) {
                        await Cfx.Delay(50);
                        waited += 50;
                }

                if (!DoesEntityExist(entity)) {
                        this.spawnedEntities.delete(entity);
                        DeleteEntity(entity);
                        await setVehicleStatus(vehicleId, "stored");
                        this.updateCacheStatus(license, vehicleId, "stored");
                        notify(source, "Failed to spawn the vehicle.", "error");
                        return false;
                }

                const savedProps = await getVehicleProperties(vehicleId);
                if (savedProps) {
                        try {
                                setVehicleProperties(entity, JSON.parse(savedProps));
                        } catch {}
                }

                notify(source, "Successfully spawned vehicle.", "success");
                await sendLog(`[VEHICLE] ${getPlayerDisplayName(source)} (${source}) spawned vehicle #${vehicleId} (${vehicle.model}) [${vehicle.plate}] at ${coords[0].toFixed(2)} ${coords[1].toFixed(2)} ${coords[2].toFixed(2)}.`);

                return true;
        }

        public async returnVehicle(source: number, args: { vehicleId: number }): Promise<boolean> {
                const license = getPlayerLicense(source);
                if (!license) return false;

                const { vehicleId } = args;
                if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
                        notify(source, "Invalid vehicle ID.", "error");
                        return false;
                }

                const ped = GetPlayerPed(source);
                if (ped === 0) {
                        notify(source, "Could not find your character.", "error");
                        return false;
                }

                const coords = GetEntityCoords(ped, true);
                if (!getArea({ x: coords[0], y: coords[1], z: coords[2] }, Config.Impound.Location)) {
                        notify(source, "You are not in the impound area!", "error");
                        return false;
                }

                const cached = this.vehicleCache.get(license);
                const vehicle = cached?.find(v => v.id === vehicleId) ?? await getVehicle(vehicleId);

                if (!vehicle || vehicle.owner !== license) {
                        notify(source, "Something went wrong.", "error");
                        return false;
                }

                // Add your inventory check here before deducting (Config.Impound.Cost is the amount).
                // Add your money deduction here.

                const returned = await setVehicleStatusAtomic(vehicleId, "stored", "impound");
                if (!returned) {
                        notify(source, "Vehicle is not impounded!", "error");
                        return false;
                }

                this.updateCacheStatus(license, vehicleId, "stored");

                notify(source, "Successfully returned vehicle from impound.", "success");
                await sendLog(`[VEHICLE] ${getPlayerDisplayName(source)} (${source}) returned vehicle #${vehicleId} from impound.`);

                return true;
        }

        public async adminGiveVehicle(source: number, args: { model: string; playerId: number }): Promise<boolean> {
                if (!IsPlayerAceAllowed(String(source), Config.Group)) {
                        notify(source, "You do not have permission to use this command.", "error");
                        return false;
                }

                const license = getPlayerLicense(source);
                if (!license) return false;

                if (!isValidModelName(args.model)) {
                        notify(source, "Invalid vehicle model name.", "error");
                        return false;
                }

                const targetLicense = getPlayerLicense(args.playerId);
                if (!targetLicense) {
                        notify(source, "No player with the specified ID found.", "error");
                        return false;
                }

                if (Config.Garage.MaxVehicles > 0 && (await countOwnedVehicles(targetLicense)) >= Config.Garage.MaxVehicles) {
                        notify(source, "This player has reached the maximum number of vehicles.", "error");
                        return false;
                }

                const plate = await this.generateUniquePlate();
                const vehicleId = await insertVehicle(plate, targetLicense, args.model);
                if (!vehicleId) {
                        notify(source, "Failed to give vehicle.", "error");
                        return false;
                }

                this.vehicleCache.delete(targetLicense);
                notify(source, "Successfully spawned vehicle.", "success");
                return true;
        }

        public async adminDeleteVehicle(source: number, args: { plate: string }): Promise<boolean> {
                if (!IsPlayerAceAllowed(String(source), Config.Group)) {
                        notify(source, "You do not have permission to use this command.", "error");
                        return false;
                }

                const license = getPlayerLicense(source);
                if (!license) return false;

                if (!isValidPlate(args.plate)) {
                        notify(source, "Invalid plate number.", "error");
                        return false;
                }

                const existing = await getVehicleByPlate(args.plate);
                if (!existing) {
                        notify(source, "Failed to find vehicle.", "error");
                        return false;
                }

                const success = await deleteVehicle(args.plate);
                if (!success) {
                        notify(source, "Failed to delete vehicle with the specified plate number from the database.", "error");
                        return false;
                }

                this.vehicleCache.delete(existing.owner);
                notify(source, "Successfully deleted vehicle with the specified plate number from the database.", "success");
                return true;
        }

        public async adminSetVehicle(source: number, args: { model: string }): Promise<boolean> {
                if (!IsPlayerAceAllowed(String(source), Config.Group)) {
                        notify(source, "You do not have permission to use this command.", "error");
                        return false;
                }

                const license = getPlayerLicense(source);
                if (!license) return false;

                if (!isValidModelName(args.model)) {
                        notify(source, "Invalid vehicle model name.", "error");
                        return false;
                }

                if (Config.Garage.MaxVehicles > 0 && (await countOwnedVehicles(license)) >= Config.Garage.MaxVehicles) {
                        notify(source, "You have reached the maximum number of vehicles.", "error");
                        return false;
                }

                const ped = GetPlayerPed(source);
                if (ped === 0) {
                        notify(source, "Could not find your character.", "error");
                        return false;
                }

                const coords = GetEntityCoords(ped, true);
                const heading = GetEntityHeading(ped);
                const plate = await this.generateUniquePlate();
                const rad = (heading * Math.PI) / 180;
                const spawnX = coords[0] + Math.sin(-rad) * 5;
                const spawnY = coords[1] + Math.cos(-rad) * 5;

                const entity = CreateVehicleServerSetter(GetHashKey(args.model), "automobile", spawnX, spawnY, coords[2] + 1, heading);
                if (!entity) {
                        notify(source, "Failed to spawn the vehicle.", "error");
                        return false;
                }

                SetVehicleNumberPlateText(entity, plate);

                let waited = 0;
                while (!DoesEntityExist(entity) && waited < 3000) {
                        await Cfx.Delay(50);
                        waited += 50;
                }

                if (!DoesEntityExist(entity)) {
                        DeleteEntity(entity);
                        notify(source, "Failed to spawn the vehicle.", "error");
                        return false;
                }

                const vehicleType = GetVehicleType(entity) || "automobile";
                const vehicleId = await insertVehicle(plate, license, args.model, vehicleType, "outside");
                if (!vehicleId) {
                        DeleteEntity(entity);
                        notify(source, "Failed to spawn the vehicle.", "error");
                        return false;
                }

                this.spawnedEntities.set(entity, vehicleId);
                this.vehicleCache.delete(license);

                notify(source, "Successfully spawned vehicle.", "success");
                return true;
        }

        public async adminViewVehicles(source: number, args: { playerId: number }): Promise<boolean> {
                if (!IsPlayerAceAllowed(String(source), Config.Group)) {
                        notify(source, "You do not have permission to use this command.", "error");
                        return false;
                }

                const license = getPlayerLicense(source);
                if (!license) return false;

                const targetLicense = getPlayerLicense(args.playerId);
                if (!targetLicense) {
                        notify(source, "No player with the specified ID found.", "error");
                        return false;
                }

                const vehicles = await getOwnedVehicles(targetLicense);
                if (vehicles.length === 0) {
                        notify(source, "No vehicles found for player with the specified ID.", "error");
                        return false;
                }

                const targetName = getPlayerDisplayName(args.playerId);
                triggerClientCallback("fivem-parking:client:listVehicles", source, vehicles, `${targetName}'s Vehicles`, true);
                await sendLog(`${getPlayerDisplayName(source)} (${source}) viewed vehicles for ${targetName} (${args.playerId}).`);

                return true;
        }
}

export const garage = new Garage();
