const sql = require("mssql/msnodesqlv8");

const connectionString =
    process.env.WASTE_DB_CONNECTION ||
    "Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\ProjectModels;Database=WasteManagementDB;Trusted_Connection=Yes;TrustServerCertificate=Yes;";

let pool;

async function connect() {
    if (!pool) {
        pool = await sql.connect({
            driver: "msnodesqlv8",
            connectionString
        });
    }

    return pool;
}

async function query(statement, parameters = []) {
    const connection = await connect();
    const request = connection.request();

    for (const [name, type, value] of parameters) {
        request.input(name, type, value);
    }

    return request.query(statement);
}

module.exports = { connect, query, sql };
