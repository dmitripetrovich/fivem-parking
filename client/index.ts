import { cache, registerContext, showContext, onServerCallback, triggerServerCallback, getVehicleProperties } from "@overextended/ox_lib/client";

type Vehicle = { id: number; plate: string; model: string; stored: string | null };

onServerCallback("fivem-parking:client:getVehicleProperties", () => {
        if (!cache.vehicle) return null;
        return getVehicleProperties(cache.vehicle);
});

onServerCallback("fivem-parking:client:listVehicles", (vehicles: Vehicle[], title?: string, readonly?: boolean) => {
        const options = vehicles.map((vehicle) => {
                const stored = vehicle.stored === "stored";
                const state = !readonly && (stored || vehicle.stored === "impound");
                return {
                        title: `${vehicle.model} (#${vehicle.id})`,
                        description: vehicle.plate,
                        metadata: [
                                {
                                        label: "Status",
                                        value: stored ? "In Garage" : vehicle.stored === "outside" ? "Outside" : vehicle.stored === "impound" ? "Impounded" : "Unknown",
                                },
                        ],
                        disabled: !state,
                        onSelect: state ? async () => {
                                if (stored) return triggerServerCallback("fivem-parking:server:spawnVehicle", 10000, vehicle.id);
                                triggerServerCallback("fivem-parking:server:returnVehicle", 10000, vehicle.id);
                        } : undefined,
                };
        });

        registerContext({
                id: "fivem_parking_vehicles",
                title: title ?? "Your Vehicles",
                options,
        });

        showContext("fivem_parking_vehicles");
});
