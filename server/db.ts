export type VehicleStatus = "stored" | "outside" | "impound";

export type Vehicle = {
        id: number;
        plate: string;
        owner: string;
        model: string;
        type: string;
        stored: VehicleStatus;
};

const ox = exports.oxmysql;

const query = <T>(sql: string, params: unknown[] = []): Promise<T[]> => new Promise((resolve, reject) => ox.query(sql, params, (result: T[] | null) => result !== null ? resolve(result) : reject(new Error(`Query returned null: ${sql}`))));

const single = <T>(sql: string, params: unknown[] = []): Promise<T | null> => new Promise((resolve, reject) => ox.single(sql, params, (result: T | null | undefined) => result !== undefined ? resolve(result) : reject(new Error(`Query returned undefined: ${sql}`))));

const insert = (sql: string, params: unknown[] = []): Promise<number> => new Promise((resolve, reject) => ox.insert(sql, params, (result: number | null) => result !== null ? resolve(result) : reject(new Error(`Insert returned null: ${sql}`))));

const update = (sql: string, params: unknown[] = []): Promise<number> => new Promise((resolve, reject) => ox.update(sql, params, (result: number | null) => result !== null ? resolve(result) : reject(new Error(`Update returned null: ${sql}`))));

const execute = (sql: string, params: unknown[] = []): Promise<number> => new Promise((resolve, reject) => ox.update(sql, params, (result: number | null) => result !== null ? resolve(result) : reject(new Error(`Execute returned null: ${sql}`))));

export const getVehicle = (id: number) => single<Vehicle>(`SELECT id, plate, owner, model, type, stored FROM parking_vehicles WHERE id = ? LIMIT 1`, [id]);

export const getVehicleByPlate = (plate: string) => single<Vehicle>(`SELECT id, plate, owner, model, type, stored FROM parking_vehicles WHERE plate = ? LIMIT 1`, [plate]);

export const plateExists = async (plate: string) => (await single<{ id: number }>("SELECT id FROM parking_vehicles WHERE plate = ? LIMIT 1", [plate])) !== null;

export const countAllVehicles = async () => (await single<{ count: number }>("SELECT COUNT(*) as count FROM parking_vehicles", []))?.count ?? 0;

export const getOwnedVehicles = (owner: string) => query<Vehicle>(`SELECT id, plate, owner, model, type, stored FROM parking_vehicles WHERE owner = ? ORDER BY id ASC`, [owner]);

export const setVehicleStatus = async (id: number, status: VehicleStatus) => (await update("UPDATE parking_vehicles SET stored = ? WHERE id = ?", [status, id])) > 0;

export const setVehicleStatusAtomic = async (id: number, newStatus: VehicleStatus, expectedStatus: VehicleStatus) => (await update("UPDATE parking_vehicles SET stored = ? WHERE id = ? AND stored = ?", [newStatus, id, expectedStatus])) > 0;

export const resetOutsideVehicles = () => update("UPDATE parking_vehicles SET stored = 'stored' WHERE stored = 'outside'");

export const insertVehicle = (plate: string, owner: string, model: string, type: string = "automobile", stored: VehicleStatus = "stored") => insert("INSERT INTO parking_vehicles (plate, owner, model, type, stored) VALUES (?, ?, ?, ?, ?)", [plate, owner, model, type, stored]);

export const updateVehicleType = async (id: number, type: string) => (await update("UPDATE parking_vehicles SET type = ? WHERE id = ?", [type, id])) > 0;

export const countOwnedVehicles = async (owner: string) => (await single<{ count: number }>("SELECT COUNT(*) as count FROM parking_vehicles WHERE owner = ?", [owner]))?.count ?? 0;

export const getVehicleProperties = async (id: number) => (await single<{ properties: string | null }>("SELECT properties FROM parking_vehicles WHERE id = ?", [id]))?.properties ?? null;

export const saveVehicleProperties = (id: number, properties: string) => update("UPDATE parking_vehicles SET properties = ? WHERE id = ?", [properties, id]);

export const deleteVehicle = async (plate: string) => (await execute("DELETE FROM parking_vehicles WHERE plate = ?", [plate])) > 0;
