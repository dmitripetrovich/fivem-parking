import * as Cfx from "@nativewrappers/fivem";
import { triggerClientCallback, setVehicleProperties, VehicleProperties } from "@overextended/ox_lib/server";
import { Config, isInArea, getPlayerDisplayName, getPlayerLicense, isValidModelName, isValidPlate, notify, sendLog } from "../utils";
import { getVehicle, getVehicleByPlate, getOwnedVehicles, countOwnedVehicles, plateExists, setVehicleStatus, setVehicleStatusAtomic, insertVehicle, updateVehicleType, getVehicleProperties, saveVehicleProperties, deleteVehicle } from "../db";

const PLATE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PROPERTIES_CALLBACK_TIMEOUT_MS = 5000;

export class Garage {
        private spawnedEntities = new Map<number, number>();
        private cooldowns = new Set<number>();

        constructor() {
                on("entityRemoved", async (entity: number) => {
                        const vehicleId = this.spawnedEntities.get(entity);
                        if (vehicleId === undefined) return;
                        this.spawnedEntities.delete(entity);
                        await setVehicleStatusAtomic(vehicleId, "stored", "outside");
                });
        }

        private checkCooldown(source: number): boolean {
                if (this.cooldowns.has(source)) return false;
                this.cooldowns.add(source);
                setTimeout(() => this.cooldowns.delete(source), Config.Cooldown);
                return true;
        }

        public clearCooldown(source: number) {
                this.cooldowns.delete(source);
        }

        public cleanupSpawnedEntities() {
                for (const entity of this.spawnedEntities.keys()) {
                        if (DoesEntityExist(entity)) DeleteEntity(entity);
                }
                this.spawnedEntities.clear();
        }

        private async generateUniquePlate(): Promise<string | null> {
                for (let i = 0; i < 20; i++) {
                        const plate = Array.from({ length: 8 }, () => PLATE_CHARS[Math.floor(Math.random() * PLATE_CHARS.length)]).join("");
                        if (!(await plateExists(plate))) return plate;
                }
                return null;
        }

        public async listVehicles(source: number) {
                const license = getPlayerLicense(source);
                if (!license) return [];

                const vehicles = await getOwnedVehicles(license);
                if (vehicles.length === 0) {
                        notify(source, "You do not own any vehicles!", "error");
                        return [];
                }

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

                const vehicle = await getVehicleByPlate(plate);
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

                if (!this.checkCooldown(source)) {
                        notify(source, "Please wait before performing another vehicle action.", "error");
                        return false;
                }

                // Add your inventory check here before deducting (Config.Garage.StoreCost is the amount).
                // Add your money deduction here.

                const parked = await setVehicleStatusAtomic(vehicle.id, "stored", "outside");
                if (!parked) {
                        notify(source, "This vehicle cannot be parked.", "error");
                        return false;
                }

                const vehicleType = GetVehicleType(entity);
                if (vehicleType && vehicleType !== vehicle.type) {
                        await updateVehicleType(vehicle.id, vehicleType);
                }

                let props: VehicleProperties | null | void = null;
                try {
                        props = await triggerClientCallback<VehicleProperties | null>("fivem-parking:client:getVehicleProperties", source, PROPERTIES_CALLBACK_TIMEOUT_MS);
                } catch (err) {
                        console.warn(`[fivem-parking] failed to fetch vehicle properties for #${vehicle.id}: ${err instanceof Error ? err.message : String(err)}`);
                }
                if (props) {
                        await saveVehicleProperties(vehicle.id, JSON.stringify(props));
                }

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

                const vehicle = await getVehicle(vehicleId);
                if (!vehicle || vehicle.owner !== license) {
                        notify(source, "Something went wrong.", "error");
                        return false;
                }

                if (vehicle.stored !== "stored") {
                        notify(source, "Vehicle is not in storage!", "error");
                        return false;
                }

                const ped = GetPlayerPed(source);
                if (ped === 0) {
                        notify(source, "Could not find your character.", "error");
                        return false;
                }

                if (!this.checkCooldown(source)) {
                        notify(source, "Please wait before performing another vehicle action.", "error");
                        return false;
                }

                // Add your inventory check here before deducting (Config.Garage.RetrieveCost is the amount).
                // Add your money deduction here.

                const reserved = await setVehicleStatusAtomic(vehicleId, "outside", "stored");
                if (!reserved) {
                        notify(source, "Vehicle is not in storage!", "error");
                        return false;
                }

                const coords = GetEntityCoords(ped, true);
                const heading = GetEntityHeading(ped);
                const rad = (heading * Math.PI) / 180;
                const spawnX = coords[0] + Math.sin(-rad) * 5;
                const spawnY = coords[1] + Math.cos(-rad) * 5;

                const entity = CreateVehicleServerSetter(GetHashKey(vehicle.model), vehicle.type || "automobile", spawnX, spawnY, coords[2] + 1, heading);
                if (!entity) {
                        await setVehicleStatus(vehicleId, "stored");
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
                        notify(source, "Failed to spawn the vehicle.", "error");
                        return false;
                }

                const savedProps = await getVehicleProperties(vehicleId);
                if (savedProps) {
                        try {
                                setVehicleProperties(entity, JSON.parse(savedProps));
                        } catch (err) {
                                console.warn(`[fivem-parking] failed to restore vehicle properties for #${vehicleId}: ${err instanceof Error ? err.message : String(err)}`);
                        }
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
                if (!isInArea({ x: coords[0], y: coords[1], z: coords[2] }, Config.Impound.Location)) {
                        notify(source, "You are not in the impound area!", "error");
                        return false;
                }

                const vehicle = await getVehicle(vehicleId);
                if (!vehicle || vehicle.owner !== license) {
                        notify(source, "Something went wrong.", "error");
                        return false;
                }

                if (!this.checkCooldown(source)) {
                        notify(source, "Please wait before performing another vehicle action.", "error");
                        return false;
                }

                // Add your inventory check here before deducting (Config.Impound.Cost is the amount).
                // Add your money deduction here.

                const returned = await setVehicleStatusAtomic(vehicleId, "stored", "impound");
                if (!returned) {
                        notify(source, "Vehicle is not impounded!", "error");
                        return false;
                }

                notify(source, "Successfully returned vehicle from impound.", "success");
                await sendLog(`[VEHICLE] ${getPlayerDisplayName(source)} (${source}) returned vehicle #${vehicleId} from impound.`);

                return true;
        }

        public async adminGiveVehicle(source: number, args: { model: string; playerId: number }): Promise<boolean> {
                if (!IsPlayerAceAllowed(String(source), Config.Group)) {
                        notify(source, "You do not have permission to use this command.", "error");
                        return false;
                }

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
                if (!plate) {
                        notify(source, "Failed to generate a unique plate.", "error");
                        return false;
                }

                const vehicleId = await insertVehicle(plate, targetLicense, args.model);
                if (!vehicleId) {
                        notify(source, "Failed to give vehicle.", "error");
                        return false;
                }

                notify(source, "Successfully gave vehicle.", "success");
                return true;
        }

        public async adminDeleteVehicle(source: number, args: { plate: string }): Promise<boolean> {
                if (!IsPlayerAceAllowed(String(source), Config.Group)) {
                        notify(source, "You do not have permission to use this command.", "error");
                        return false;
                }

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
                if (!plate) {
                        notify(source, "Failed to generate a unique plate.", "error");
                        return false;
                }
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

                notify(source, "Successfully spawned vehicle.", "success");
                return true;
        }

        public async adminViewVehicles(source: number, args: { playerId: number }): Promise<boolean> {
                if (!IsPlayerAceAllowed(String(source), Config.Group)) {
                        notify(source, "You do not have permission to use this command.", "error");
                        return false;
                }

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
