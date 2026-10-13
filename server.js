const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const { csrfSync } = require("csrf-sync");
const database = require("./database");

const app = express();
const port = Number(process.env.PORT || 3000);
const { sql, query } = database;
const statuses = ["Pending", "In Progress", "Collected", "Resolved"];
const wasteTypes = [
    "Household Waste",
    "Plastic Waste",
    "Paper Waste",
    "Food Waste",
    "Electronic Waste",
    "Construction Waste",
    "Medical Waste",
    "Garden Waste",
    "Mixed Waste",
    "Other"
];
const pageTemplates = {
    home: "Home/Index",
    about: "Home/About",
    contact: "Home/Contact",
    "admin-dashboard": "Admin/Dashboard",
    "admin-login": "Admin/Login",
    "citizen-login": "Citizen/Login",
    "citizen-register": "Citizen/Register",
    "register-success": "Citizen/RegisterSuccess",
    "feedback-create": "Feedback/Create",
    "waste-details": "Waste/Details",
    "waste-my-complaints": "Waste/MyComplaints",
    "waste-report": "Waste/Report",
    "waste-success": "Waste/Success",
    "waste-track": "Waste/Track",
    "waste-track-result": "Waste/TrackResult",
    "worker-dashboard": "Worker/Dashboard",
    "worker-login": "Worker/Login",
    "worker-register": "Worker/Register"
};

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"]
        }
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    name: "waste.sid",
    secret: process.env.SESSION_SECRET || "waste-management-development-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 60 * 1000
    }
}));

const {
    generateToken,
    csrfSynchronisedProtection
} = csrfSync({
    getTokenFromRequest: (req) => req.body?._csrf || req.headers["x-csrf-token"]
});

app.use(csrfSynchronisedProtection);
app.use((req, res, next) => {
    res.locals.csrfToken = generateToken(req);
    res.locals.session = req.session;
    res.locals.flash = req.session.flash || {};
    delete req.session.flash;
    next();
});

function page(res, name, title, data = {}) {
    const template = pageTemplates[name];
    if (!template) throw new Error(`No view template is registered for "${name}".`);
    return res.render("Shared/Layout", {
        page: template,
        title,
        errorMessage: null,
        values: {},
        complaintId: null,
        dateLabel,
        ...data
    });
}

function setFlash(req, kind, message) {
    req.session.flash = { [kind]: message };
}

function redirectToLogin(res, role) {
    return res.redirect(`/${role}/Login`);
}

function sha256(value) {
    return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function safeCompare(left, right) {
    const first = Buffer.from(left);
    const second = Buffer.from(right);
    return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function requireCitizen(req, res, next) {
    if (!req.session.citizenId) return redirectToLogin(res, "Citizen");
    next();
}

function requireWorker(req, res, next) {
    if (!req.session.workerId) return redirectToLogin(res, "Worker");
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.adminLoggedIn) return redirectToLogin(res, "Admin");
    next();
}

function dateLabel(value, includeTime = true) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
}

function renderErrors(res, title, error, statusCode = 500) {
    console.error(error);
    return res.status(statusCode).render("Shared/Error", { title, error });
}

app.get("/", async (req, res, next) => {
    try {
        const result = await query(
            "SELECT Status, COUNT(*) AS Total FROM dbo.WasteComplaints GROUP BY Status"
        );
        const counts = Object.fromEntries(result.recordset.map(row => [row.Status, row.Total]));
        return page(res, "home", "Home", {
            stats: {
                total: result.recordset.reduce((sum, row) => sum + row.Total, 0),
                pending: counts.Pending || 0,
                inProgress: counts["In Progress"] || 0,
                resolved: counts.Resolved || 0
            }
        });
    } catch (error) {
        next(error);
    }
});

app.get("/Home/Index", (req, res) => res.redirect("/"));
app.get("/Home/About", (req, res) => page(res, "about", "About Us"));
app.get("/Home/Contact", (req, res) => page(res, "contact", "Contact Us"));
app.get("/Home/Error", (req, res) => renderErrors(res, "Error", new Error("An error occurred.")));

app.get("/Citizen/Register", (req, res) => page(res, "citizen-register", "Citizen Registration"));
app.post("/Citizen/Register", async (req, res, next) => {
    try {
        const fullName = String(req.body.fullName || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");
        if (!fullName || !email || !password) {
            return page(res, "citizen-register", "Citizen Registration", {
                errorMessage: "Please fill in all fields."
            });
        }

        const existing = await query(
            "SELECT COUNT(*) AS Total FROM dbo.Citizens WHERE Email = @email",
            [["email", sql.NVarChar(320), email]]
        );
        if (existing.recordset[0].Total) {
            return page(res, "citizen-register", "Citizen Registration", {
                errorMessage: "This email is already registered."
            });
        }

        await query(
            "INSERT INTO dbo.Citizens (FullName, Email, PasswordHash) VALUES (@name, @email, @hash)",
            [
                ["name", sql.NVarChar(255), fullName],
                ["email", sql.NVarChar(320), email],
                ["hash", sql.NVarChar(64), sha256(password)]
            ]
        );
        return res.redirect("/Citizen/RegisterSuccess");
    } catch (error) {
        next(error);
    }
});

app.get("/Citizen/RegisterSuccess", (req, res) =>
    page(res, "register-success", "Registration Successful"));

app.get("/Citizen/Login", (req, res) => page(res, "citizen-login", "Citizen Login"));
app.post("/Citizen/Login", async (req, res, next) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");
        if (!email || !password) {
            return page(res, "citizen-login", "Citizen Login", {
                errorMessage: "Please enter your email and password."
            });
        }

        const result = await query(
            "SELECT TOP (1) CitizenID, FullName, PasswordHash FROM dbo.Citizens WHERE Email = @email",
            [["email", sql.NVarChar(320), email]]
        );
        const citizen = result.recordset[0];
        if (!citizen || !safeCompare(citizen.PasswordHash, sha256(password))) {
            return page(res, "citizen-login", "Citizen Login", {
                errorMessage: "Invalid email or password."
            });
        }

        req.session.citizenId = citizen.CitizenID;
        req.session.citizenName = citizen.FullName;
        return res.redirect("/");
    } catch (error) {
        next(error);
    }
});

app.get("/Citizen/Logout", (req, res) => {
    delete req.session.citizenId;
    delete req.session.citizenName;
    return res.redirect("/Citizen/Login");
});

app.get("/Worker/Register", (req, res) => page(res, "worker-register", "Worker Registration"));
app.post("/Worker/Register", async (req, res, next) => {
    try {
        const fullName = String(req.body.fullName || "").trim();
        const email = String(req.body.email || "").trim();
        const password = String(req.body.password || "");
        const phone = String(req.body.phone || "").trim();
        if (!fullName || !email || !password) {
            return page(res, "worker-register", "Worker Registration", {
                errorMessage: "Please fill all required fields."
            });
        }

        const existing = await query(
            "SELECT COUNT(*) AS Total FROM dbo.Workers WHERE Email = @email",
            [["email", sql.NVarChar(320), email]]
        );
        if (existing.recordset[0].Total) {
            return page(res, "worker-register", "Worker Registration", {
                errorMessage: "Worker with this email already exists."
            });
        }

        await query(
            "INSERT INTO dbo.Workers (FullName, Email, PasswordHash, Phone, IsActive) VALUES (@name, @email, @hash, @phone, 1)",
            [
                ["name", sql.NVarChar(255), fullName],
                ["email", sql.NVarChar(320), email],
                ["hash", sql.NVarChar(64), sha256(password)],
                ["phone", sql.NVarChar(100), phone || null]
            ]
        );
        return res.redirect("/Worker/Login");
    } catch (error) {
        next(error);
    }
});

app.get("/Worker/Login", (req, res) => {
    if (req.session.workerId) return res.redirect("/Worker/Dashboard");
    return page(res, "worker-login", "Worker Login");
});
app.post("/Worker/Login", async (req, res, next) => {
    try {
        const email = String(req.body.email || "").trim();
        const password = String(req.body.password || "");
        if (!email || !password) {
            return page(res, "worker-login", "Worker Login", {
                errorMessage: "Please enter your email and password."
            });
        }

        const result = await query(
            "SELECT TOP (1) WorkerID, FullName, PasswordHash FROM dbo.Workers WHERE Email = @email AND IsActive = 1",
            [["email", sql.NVarChar(320), email]]
        );
        const worker = result.recordset[0];
        if (!worker || !safeCompare(worker.PasswordHash, sha256(password))) {
            return page(res, "worker-login", "Worker Login", {
                errorMessage: "Invalid email or password."
            });
        }

        req.session.workerId = worker.WorkerID;
        req.session.workerName = worker.FullName;
        return res.redirect("/Worker/Dashboard");
    } catch (error) {
        next(error);
    }
});

app.get("/Worker/Logout", (req, res) => {
    delete req.session.workerId;
    delete req.session.workerName;
    return res.redirect("/Worker/Login");
});

app.get("/Worker/Dashboard", requireWorker, async (req, res, next) => {
    try {
        const result = await query(
            "SELECT * FROM dbo.WasteComplaints WHERE WorkerID = @workerId ORDER BY ReportDate DESC",
            [["workerId", sql.Int, req.session.workerId]]
        );
        const complaints = result.recordset;
        return page(res, "worker-dashboard", "Worker Dashboard", {
            complaints,
            stats: statusCounts(complaints)
        });
    } catch (error) {
        next(error);
    }
});

function statusCounts(complaints) {
    return {
        total: complaints.length,
        pending: complaints.filter(item => item.Status === "Pending").length,
        inProgress: complaints.filter(item => item.Status === "In Progress").length,
        collected: complaints.filter(item => item.Status === "Collected").length,
        resolved: complaints.filter(item => item.Status === "Resolved").length
    };
}

app.post("/Worker/UpdateStatus", requireWorker, async (req, res, next) => {
    try {
        const complaintId = Number(req.body.complaintId);
        const status = String(req.body.status || "");
        if (!Number.isSafeInteger(complaintId) || !["In Progress", "Collected"].includes(status)) {
            setFlash(req, "errorMessage", "Please choose a valid complaint status.");
            return res.redirect("/Worker/Dashboard");
        }
        await query(
            "UPDATE dbo.WasteComplaints SET Status = @status WHERE ComplaintID = @id AND WorkerID = @workerId",
            [
                ["status", sql.NVarChar(50), status],
                ["id", sql.Int, complaintId],
                ["workerId", sql.Int, req.session.workerId]
            ]
        );
        return res.redirect("/Worker/Dashboard");
    } catch (error) {
        next(error);
    }
});

app.post("/Worker/VerifyLocation", requireWorker, async (req, res, next) => {
    try {
        const complaintId = Number(req.body.complaintId);
        const latitude = Number(req.body.workerLatitude);
        const longitude = Number(req.body.workerLongitude);
        if (!Number.isSafeInteger(complaintId) || !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            setFlash(req, "errorMessage", "Unable to read your GPS location. Please try again.");
            return res.redirect("/Worker/Dashboard");
        }

        const result = await query(
            "SELECT Latitude, Longitude FROM dbo.WasteComplaints WHERE ComplaintID = @id AND WorkerID = @workerId",
            [
                ["id", sql.Int, complaintId],
                ["workerId", sql.Int, req.session.workerId]
            ]
        );
        const complaint = result.recordset[0];
        if (!complaint) {
            setFlash(req, "errorMessage", "Complaint not found or not assigned to you.");
            return res.redirect("/Worker/Dashboard");
        }
        if (complaint.Latitude === null || complaint.Longitude === null) {
            setFlash(req, "errorMessage", "Citizen GPS location is not available for this complaint.");
            return res.redirect("/Worker/Dashboard");
        }

        const distance = distanceInMeters(
            complaint.Latitude, complaint.Longitude, latitude, longitude
        );
        const verified = distance <= 50;
        await query(
            "UPDATE dbo.WasteComplaints SET WorkerLatitude = @latitude, WorkerLongitude = @longitude, LocationVerified = @verified, Status = CASE WHEN @verified = 1 THEN N'Collected' ELSE Status END WHERE ComplaintID = @id AND WorkerID = @workerId",
            [
                ["latitude", sql.Float, latitude],
                ["longitude", sql.Float, longitude],
                ["verified", sql.Bit, verified],
                ["id", sql.Int, complaintId],
                ["workerId", sql.Int, req.session.workerId]
            ]
        );
        setFlash(
            req,
            verified ? "successMessage" : "errorMessage",
            verified
                ? "GPS verified successfully. Waste collection confirmed."
                : `You are ${distance.toFixed(1)} meters away from the reported location. You must be within 50 meters.`
        );
        return res.redirect("/Worker/Dashboard");
    } catch (error) {
        next(error);
    }
});

function distanceInMeters(latitude1, longitude1, latitude2, longitude2) {
    const earthRadius = 6371000;
    const toRadians = degrees => degrees * Math.PI / 180;
    const deltaLatitude = toRadians(latitude2 - latitude1);
    const deltaLongitude = toRadians(longitude2 - longitude1);
    const firstLatitude = toRadians(latitude1);
    const secondLatitude = toRadians(latitude2);
    const a = Math.sin(deltaLatitude / 2) ** 2 +
        Math.cos(firstLatitude) * Math.cos(secondLatitude) *
        Math.sin(deltaLongitude / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.get("/Admin/Login", (req, res) => {
    if (req.session.adminLoggedIn) return res.redirect("/Admin/Dashboard");
    return page(res, "admin-login", "Admin Login");
});
app.post("/Admin/Login", (req, res) => {
    const expectedUser = process.env.ADMIN_USERNAME || "admin";
    const expectedPassword = process.env.ADMIN_PASSWORD || "Admin@123";
    if (safeCompare(String(req.body.username || ""), expectedUser) &&
        safeCompare(String(req.body.password || ""), expectedPassword)) {
        req.session.adminLoggedIn = true;
        return res.redirect("/Admin/Dashboard");
    }
    return page(res, "admin-login", "Admin Login", {
        errorMessage: "Invalid username or password."
    });
});

app.get("/Admin/Dashboard", requireAdmin, async (req, res, next) => {
    try {
        const [complaintResult, workerResult, feedbackResult] = await Promise.all([
            query("SELECT * FROM dbo.WasteComplaints ORDER BY ReportDate DESC"),
            query("SELECT WorkerID, FullName FROM dbo.Workers WHERE IsActive = 1 ORDER BY FullName"),
            query("SELECT TOP (100) * FROM dbo.Feedback ORDER BY FeedbackDate DESC")
        ]);
        const feedbacks = feedbackResult.recordset;
        const averageRating = feedbacks.length
            ? feedbacks.reduce((sum, item) => sum + item.Rating, 0) / feedbacks.length
            : 0;
        return page(res, "admin-dashboard", "Admin Dashboard", {
            complaints: complaintResult.recordset,
            workers: workerResult.recordset,
            feedbacks,
            stats: statusCounts(complaintResult.recordset),
            averageRating
        });
    } catch (error) {
        next(error);
    }
});

app.post("/Admin/AssignWorker", requireAdmin, async (req, res, next) => {
    try {
        const complaintId = Number(req.body.complaintId);
        const workerId = Number(req.body.workerId);
        if (!Number.isSafeInteger(complaintId) || !Number.isSafeInteger(workerId)) {
            setFlash(req, "errorMessage", "Please select a valid complaint and worker.");
            return res.redirect("/Admin/Dashboard");
        }
        await query(
            "UPDATE c SET WorkerID = @workerId, Status = CASE WHEN Status = N'Pending' THEN N'In Progress' ELSE Status END FROM dbo.WasteComplaints AS c WHERE c.ComplaintID = @complaintId AND EXISTS (SELECT 1 FROM dbo.Workers WHERE WorkerID = @workerId AND IsActive = 1)",
            [
                ["workerId", sql.Int, workerId],
                ["complaintId", sql.Int, complaintId]
            ]
        );
        return res.redirect("/Admin/Dashboard");
    } catch (error) {
        next(error);
    }
});

app.post("/Admin/UpdateStatus", requireAdmin, async (req, res, next) => {
    try {
        const complaintId = Number(req.body.complaintId);
        const status = String(req.body.status || "");
        if (!Number.isSafeInteger(complaintId) || !statuses.includes(status)) {
            setFlash(req, "errorMessage", "Please choose a valid complaint status.");
            return res.redirect("/Admin/Dashboard");
        }
        await query(
            "UPDATE dbo.WasteComplaints SET Status = @status WHERE ComplaintID = @id",
            [
                ["status", sql.NVarChar(50), status],
                ["id", sql.Int, complaintId]
            ]
        );
        return res.redirect("/Admin/Dashboard");
    } catch (error) {
        next(error);
    }
});

app.get("/Admin/Logout", (req, res) => {
    req.session.destroy(error => {
        if (error) return renderErrors(res, "Error", error);
        res.clearCookie("waste.sid");
        return res.redirect("/Admin/Login");
    });
});

app.get("/Waste/Report", requireCitizen, (req, res) =>
    page(res, "waste-report", "Report Waste", { wasteTypes }));
app.post("/Waste/Report", requireCitizen, async (req, res, next) => {
    try {
        const name = String(req.body.Name || "").trim();
        const location = String(req.body.Location || "").trim();
        const wasteType = String(req.body.WasteType || "");
        const description = String(req.body.Description || "").trim();
        const latitude = parseCoordinate(req.body.Latitude, -90, 90);
        const longitude = parseCoordinate(req.body.Longitude, -180, 180);
        if (!name || !location || !wasteTypes.includes(wasteType) || !description) {
            return page(res, "waste-report", "Report Waste", {
                wasteTypes,
                errorMessage: "Please check all required fields.",
                values: req.body
            });
        }
        if (latitude === undefined || longitude === undefined ||
            ((latitude === null) !== (longitude === null))) {
            return page(res, "waste-report", "Report Waste", {
                wasteTypes,
                errorMessage: "Please capture a valid GPS location before submitting.",
                values: req.body
            });
        }

        await query(
            "INSERT INTO dbo.WasteComplaints (CitizenID, Name, Location, WasteType, Description, Status, ReportDate, ComplaintPhoto, Latitude, Longitude, LocationVerified) VALUES (@citizenId, @name, @location, @wasteType, @description, N'Pending', GETDATE(), NULL, @latitude, @longitude, 0)",
            [
                ["citizenId", sql.Int, req.session.citizenId],
                ["name", sql.NVarChar(255), name],
                ["location", sql.NVarChar(500), location],
                ["wasteType", sql.NVarChar(255), wasteType],
                ["description", sql.NVarChar(sql.MAX), description],
                ["latitude", sql.Float, latitude],
                ["longitude", sql.Float, longitude]
            ]
        );
        return res.redirect("/Waste/Success");
    } catch (error) {
        next(error);
    }
});

function parseCoordinate(value, minimum, maximum) {
    if (value === "" || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) return undefined;
    return number;
}

app.get("/Waste/Success", requireCitizen, (req, res) =>
    page(res, "waste-success", "Complaint Submitted"));

app.get("/Waste/Track", requireCitizen, (req, res) =>
    page(res, "waste-track", "Track Complaint"));
app.post("/Waste/Track", requireCitizen, async (req, res, next) => {
    try {
        const complaintId = Number(req.body.complaintId);
        if (!Number.isSafeInteger(complaintId) || complaintId < 1) {
            return page(res, "waste-track", "Track Complaint", {
                errorMessage: "Enter a valid complaint ID."
            });
        }
        const result = await query(
            "SELECT * FROM dbo.WasteComplaints WHERE ComplaintID = @id AND CitizenID = @citizenId",
            [
                ["id", sql.Int, complaintId],
                ["citizenId", sql.Int, req.session.citizenId]
            ]
        );
        if (!result.recordset.length) {
            return page(res, "waste-track", "Track Complaint", {
                errorMessage: "Complaint not found or this complaint does not belong to your account."
            });
        }
        return page(res, "waste-track-result", "Complaint Tracking", {
            complaint: result.recordset[0],
            statuses,
            dateLabel
        });
    } catch (error) {
        next(error);
    }
});

app.get("/Waste/MyComplaints", requireCitizen, async (req, res, next) => {
    try {
        const result = await query(
            "SELECT * FROM dbo.WasteComplaints WHERE CitizenID = @citizenId ORDER BY ReportDate DESC",
            [["citizenId", sql.Int, req.session.citizenId]]
        );
        const complaints = result.recordset;
        const resolvedComplaint = complaints.find(item => item.Status === "Resolved");
        return page(res, "waste-my-complaints", "My Complaints", {
            complaints,
            dateLabel,
            resolutionMessage: resolvedComplaint
                ? `Your complaint #${resolvedComplaint.ComplaintID} has been resolved successfully. Thank you for helping keep the community clean!`
                : null
        });
    } catch (error) {
        next(error);
    }
});

app.get("/Waste/Details/:id", requireCitizen, async (req, res, next) => {
    try {
        const complaintId = Number(req.params.id);
        const result = await query(
            "SELECT * FROM dbo.WasteComplaints WHERE ComplaintID = @id AND CitizenID = @citizenId",
            [
                ["id", sql.Int, complaintId],
                ["citizenId", sql.Int, req.session.citizenId]
            ]
        );
        if (!result.recordset.length) return res.status(404).render("Shared/Error", {
            title: "Complaint Not Found",
            error: null
        });
        return page(res, "waste-details", "Complaint Details", {
            complaint: result.recordset[0],
            dateLabel
        });
    } catch (error) {
        next(error);
    }
});

app.get("/Feedback/Create", requireCitizen, async (req, res, next) => {
    try {
        const complaintId = Number(req.query.complaintId);
        const result = await query(
            "SELECT Status FROM dbo.WasteComplaints WHERE ComplaintID = @id AND CitizenID = @citizenId",
            [
                ["id", sql.Int, complaintId],
                ["citizenId", sql.Int, req.session.citizenId]
            ]
        );
        if (!result.recordset.length || result.recordset[0].Status !== "Resolved") {
            setFlash(req, "errorMessage", "Feedback is available after your complaint is resolved.");
            return res.redirect("/Waste/MyComplaints");
        }
        const feedback = await query(
            "SELECT COUNT(*) AS Total FROM dbo.Feedback WHERE ComplaintID = @id AND CitizenID = @citizenId",
            [
                ["id", sql.Int, complaintId],
                ["citizenId", sql.Int, req.session.citizenId]
            ]
        );
        if (feedback.recordset[0].Total) {
            setFlash(req, "errorMessage", "You have already submitted feedback for this complaint.");
            return res.redirect("/Waste/MyComplaints");
        }
        return page(res, "feedback-create", "Give Feedback", { complaintId });
    } catch (error) {
        next(error);
    }
});
app.post("/Feedback/Create", requireCitizen, async (req, res, next) => {
    try {
        const complaintId = Number(req.body.complaintId);
        const rating = Number(req.body.rating);
        if (!Number.isSafeInteger(complaintId) || !Number.isInteger(rating) ||
            rating < 1 || rating > 5) {
            return page(res, "feedback-create", "Give Feedback", {
                complaintId,
                errorMessage: "Please select a rating between 1 and 5 stars."
            });
        }
        const result = await query(
            "SELECT Status FROM dbo.WasteComplaints WHERE ComplaintID = @id AND CitizenID = @citizenId",
            [
                ["id", sql.Int, complaintId],
                ["citizenId", sql.Int, req.session.citizenId]
            ]
        );
        if (!result.recordset.length || result.recordset[0].Status !== "Resolved") {
            setFlash(req, "errorMessage", "Feedback can be submitted only after the complaint is resolved.");
            return res.redirect("/Waste/MyComplaints");
        }
        const comments = String(req.body.comments || "").trim();
        await query(
            "INSERT INTO dbo.Feedback (ComplaintID, CitizenID, Rating, Comments, FeedbackDate) VALUES (@complaintId, @citizenId, @rating, @comments, GETDATE())",
            [
                ["complaintId", sql.Int, complaintId],
                ["citizenId", sql.Int, req.session.citizenId],
                ["rating", sql.Int, rating],
                ["comments", sql.NVarChar(sql.MAX), comments || null]
            ]
        );
        setFlash(req, "successMessage", "Thank you! Your feedback has been submitted successfully.");
        return res.redirect("/Waste/MyComplaints");
    } catch (error) {
        next(error);
    }
});

app.use((req, res) => res.status(404).render("Shared/Error", {
    title: "Page Not Found",
    error: null
}));

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === "EBADCSRFTOKEN") {
        return res.status(403).render("Shared/Error", {
            title: "Session Expired",
            error: new Error("This form has expired. Please go back, refresh the page, and try again.")
        });
    }
    console.error(error);
    return res.status(500).render("Shared/Error", {
        title: "Something Went Wrong",
        error: process.env.NODE_ENV === "development"
            ? error
            : new Error("Please try again. If the problem continues, contact the site administrator.")
    });
});

async function start() {
    await database.connect();
    app.listen(port, () => {
        console.log(`Waste Management System running at http://localhost:${port}`);
    });
}

if (require.main === module) {
    start().catch(error => {
        console.error("The website could not start because its SQL Server database is unavailable.", error);
        process.exitCode = 1;
    });
}

module.exports = { app, dateLabel, distanceInMeters, parseCoordinate, sha256 };
