import { callProkerala } from "../services/prokeralaClient.js";

const getProkeralaErrorDetails = (error) => {
    const details = {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        responseData: error?.response?.data || null,
        request: {
            method: error?.config?.method?.toUpperCase?.(),
            url: error?.config?.url,
            params: error?.config?.params || null,
        },
    };

    if (error?.response?.headers) {
        details.responseHeaders = {
            requestId:
                error.response.headers["x-request-id"] ||
                error.response.headers["x-correlation-id"] ||
                null,
            retryAfter: error.response.headers["retry-after"] || null,
        };
    }

    return details;
};

export const getDailyHoroscope = async (req, res) => {
    try {
        const { sign } = req.body || {};

        const endpoint = process.env.PROKERALA_FREE_SERVICE_ENDPOINT;

        if (!endpoint) {
            return res.status(500).json({
                success: false,
                message:
                    "Prokerala daily horoscope endpoint is not configured. Please set PROKERALA_FREE_SERVICE_ENDPOINT.",
            });
        }

        if (!sign) {
            return res.status(400).json({
                success: false,
                message: "sign is required for daily horoscope (e.g. aries, taurus, ...).",
            });
        }

        // Prokerala Sandbox restriction: only January 1st is allowed for any year.
        // For production, this should be the actual today's date.
        let datetime;
        if (process.env.PROKERALA_SANDBOX_MODE === "true") {
            const currentYear = new Date().getFullYear();
            datetime = `${currentYear}-01-01T00:00:00+00:00`;
        } else {
            // Use real-time for production
            datetime = new Date().toISOString().slice(0, 19) + "+00:00";
        }
        
        const params = {
            datetime,
        };

        // If endpoint contains {sign} placeholder, replace it. Otherwise pass as query param.
        let finalEndpoint = endpoint;
        if (endpoint.includes("{sign}")) {
            finalEndpoint = endpoint.replace("{sign}", String(sign).toLowerCase());
        } else {
            params.sign = String(sign).toLowerCase();
        }

        const prokeralaResponse = await callProkerala(finalEndpoint, params, "GET");

        res.status(200).json({
            success: true,
            data: prokeralaResponse.data || prokeralaResponse,
        });
    } catch (error) {
        const errorDetails = getProkeralaErrorDetails(error);
        console.error(
            "Prokerala Daily Horoscope Error:",
            JSON.stringify(errorDetails, null, 2)
        );
        res.status(500).json({
            success: false,
            message: "Failed to fetch daily horoscope from Prokerala",
            error: error.message,
        });
    }
};

export const generateKundali = async (req, res) => {
    try {
        const { payload } = req.body || {};

        const endpoint =
            process.env.PROKERALA_KUNDALI_ADVANCED_ENDPOINT ||
            process.env.PROKERALA_KUNDALI_ENDPOINT ||
            process.env.PROKERALA_BIRTH_CHART_ENDPOINT;

        if (!endpoint) {
            return res.status(500).json({
                success: false,
                message:
                    "Prokerala kundali endpoint is not configured. Please set PROKERALA_KUNDALI_ENDPOINT or PROKERALA_BIRTH_CHART_ENDPOINT.",
            });
        }

        // Map our payload (name, date, time, place) to Prokerala's required query params.
        // Support both flat payload and nested bride/groom structure from the frontend.
        let dateOfBirth = payload?.dateOfBirth; // YYYY-MM-DD
        let birthTime = payload?.birthTime; // HH:MM

        if (!dateOfBirth && payload?.bride?.dateOfBirth) {
            dateOfBirth = payload.bride.dateOfBirth;
        }
        if (!birthTime && payload?.bride?.birthTime) {
            birthTime = payload.bride.birthTime;
        }

        if (!dateOfBirth || !birthTime) {
            return res.status(400).json({
                success: false,
                message: "dateOfBirth and birthTime are required for kundali calculation.",
            });
        }

        // Coordinates: expect either a ready-made string, or latitude/longitude, or fall back to example coords
        const coordinates =
            payload?.coordinates ||
            (payload?.latitude && payload?.longitude
                ? `${payload.latitude},${payload.longitude}`
                : "23.1765,75.7885"); // Default example from Prokerala docs (Indore, India)

        // Timezone offset: allow override from payload.timezoneOffset, else default to +05:30 (IST)
        const timezoneOffset = payload?.timezoneOffset || "+05:30";

        let datetime;
        if (process.env.PROKERALA_SANDBOX_MODE === "true") {
            const [year] = dateOfBirth.split("-");
            datetime = `${year}-01-01T${birthTime}:00${timezoneOffset}`;
        } else {
            datetime = `${dateOfBirth}T${birthTime}:00${timezoneOffset}`;
        }

        const prokeralaParams = {
            ayanamsa: 1,
            coordinates,
            datetime,
            la: "en",
        };

        const prokeralaResponse = await callProkerala(
            endpoint,
            prokeralaParams,
            "GET"
        );

        let planetPositions = [];
        try {
            const planetRes = await callProkerala(
                "/v2/astrology/planet-position",
                prokeralaParams,
                "GET"
            );
            planetPositions = planetRes.data?.planet_position || planetRes.data || [];
        } catch (planetErr) {
            console.error("Failed to fetch planet positions for Kundli:", planetErr.message);
        }

        const mergedData = {
            ...(prokeralaResponse.data || prokeralaResponse),
            planet_positions: planetPositions
        };

        res.status(200).json({
            success: true,
            data: mergedData,
        });
    } catch (error) {
        const errorDetails = getProkeralaErrorDetails(error);
        console.error(
            "Prokerala Kundali Error Details:",
            JSON.stringify(errorDetails, null, 2)
        );

        const downstreamMessage =
            error?.response?.data?.message ||
            error?.response?.data?.error?.message ||
            error?.message;

        res.status(500).json({
            success: false,
            message: "Failed to generate kundali from Prokerala",
            error: downstreamMessage,
        });
    }
};

export const kundliMatching = async (req, res) => {
    try {
        const { bride, groom } = req.body?.payload || {};

        const endpoint = process.env.PROKERALA_KUNDLI_MATCH_ENDPOINT;

        if (!endpoint) {
            return res.status(500).json({
                success: false,
                message:
                    "Prokerala kundli matching endpoint is not configured. Please set PROKERALA_KUNDLI_MATCH_ENDPOINT.",
            });
        }

        if (!bride?.dateOfBirth || !bride?.birthTime || !groom?.dateOfBirth || !groom?.birthTime) {
            return res.status(400).json({
                success: false,
                message:
                    "Bride and groom dateOfBirth and birthTime are required for kundli matching.",
            });
        }

        const brideCoords =
            bride.coordinates ||
            (bride.latitude && bride.longitude
                ? `${bride.latitude},${bride.longitude}`
                : "23.1765,75.7885");

        const groomCoords =
            groom.coordinates ||
            (groom.latitude && groom.longitude
                ? `${groom.latitude},${groom.longitude}`
                : "23.1765,75.7885");

        const tzOffset = req.body?.payload?.timezoneOffset || "+05:30";

        const toIso = (dob, time) => {
            const [year, month, day] = dob.split("-");
            const [hh, mm] = time.split(":");
            const safeYear = year || "2000";
            const safeMonth = month || "01";
            const safeDay = day || "01";
            const safeTime = `${hh || "00"}:${mm || "00"}`;
            if (process.env.PROKERALA_SANDBOX_MODE === "true") {
                return `${safeYear}-01-01T${safeTime}:00${tzOffset}`;
            } else {
                return `${safeYear}-${safeMonth}-${safeDay}T${safeTime}:00${tzOffset}`;
            }
        };

        const girl_dob = toIso(bride.dateOfBirth, bride.birthTime);
        const boy_dob = toIso(groom.dateOfBirth, groom.birthTime);

        const params = {
            ayanamsa: 1,
            girl_coordinates: brideCoords,
            girl_dob,
            boy_coordinates: groomCoords,
            boy_dob,
            la: "en",
        };

        const prokeralaResponse = await callProkerala(endpoint, params, "GET");

        res.status(200).json({
            success: true,
            data: prokeralaResponse.data || prokeralaResponse,
        });
    } catch (error) {
        const errorDetails = getProkeralaErrorDetails(error);
        console.error(
            "Prokerala Kundli Matching Error:",
            JSON.stringify(errorDetails, null, 2)
        );

        const downstreamMessage =
            error?.response?.data?.message ||
            error?.response?.data?.error?.message ||
            error?.message;

        res.status(500).json({
            success: false,
            message: "Failed to perform kundli matching via Prokerala",
            error: downstreamMessage,
        });
    }
};

export const getMangalDosha = async (req, res) => {
    try {
        const { payload } = req.body || {};

        const endpoint = process.env.PROKERALA_MANGAL_DOSHA_ENDPOINT;

        if (!endpoint) {
            return res.status(500).json({
                success: false,
                message:
                    "Prokerala mangal dosha endpoint is not configured. Please set PROKERALA_MANGAL_DOSHA_ENDPOINT.",
            });
        }

        const dateOfBirth = payload?.dateOfBirth;
        const birthTime = payload?.birthTime;

        if (!dateOfBirth || !birthTime) {
            return res.status(400).json({
                success: false,
                message: "dateOfBirth and birthTime are required for mangal dosha analysis.",
            });
        }

        const coordinates =
            payload?.coordinates ||
            (payload?.latitude && payload?.longitude
                ? `${payload.latitude},${payload.longitude}`
                : "23.1765,75.7885");

        const timezoneOffset = payload?.timezoneOffset || "+05:30";
        let datetime;
        if (process.env.PROKERALA_SANDBOX_MODE === "true") {
            const [year] = dateOfBirth.split("-");
            datetime = `${year}-01-01T${birthTime}:00${timezoneOffset}`;
        } else {
            datetime = `${dateOfBirth}T${birthTime}:00${timezoneOffset}`;
        }

        const params = {
            ayanamsa: 1,
            coordinates,
            datetime,
            la: "en",
        };

        const prokeralaResponse = await callProkerala(endpoint, params, "GET");

        res.status(200).json({
            success: true,
            data: prokeralaResponse.data || prokeralaResponse,
        });
    } catch (error) {
        const errorDetails = getProkeralaErrorDetails(error);
        console.error(
            "Prokerala Mangal Dosha Error:",
            JSON.stringify(errorDetails, null, 2)
        );
        res.status(500).json({
            success: false,
            message: "Failed to fetch mangal dosha from Prokerala",
            error: error.message,
        });
    }
};

export const getPanchang = async (req, res) => {
    try {
        const { date, coordinates, timezoneOffset } = req.body || {};

        const endpoint = process.env.PROKERALA_PANCHANG_ENDPOINT;

        if (!endpoint) {
            return res.status(500).json({
                success: false,
                message:
                    "Prokerala panchang endpoint is not configured. Please set PROKERALA_PANCHANG_ENDPOINT.",
            });
        }

        const coords =
            coordinates ||
            "23.1765,75.7885";

        const isoDate = date || new Date().toISOString().slice(0, 10);
        const offset = timezoneOffset || "+05:30";
        let datetime;
        if (process.env.PROKERALA_SANDBOX_MODE === "true") {
            // Sandbox: use today's date to stay in the allowed window
            const today = new Date().toISOString().slice(0, 10);
            datetime = `${today}T00:00:00${offset}`;
        } else {
            datetime = `${isoDate}T00:00:00${offset}`;
        }

        const params = {
            ayanamsa: 1,
            coordinates: coords,
            datetime,
            la: "en",
        };

        const prokeralaResponse = await callProkerala(endpoint, params, "GET");
        const rawData = prokeralaResponse.data || prokeralaResponse;
        console.log("[Panchang raw keys]:", Object.keys(rawData || {}));

        res.status(200).json({
            success: true,
            data: rawData,
        });
    } catch (error) {
        const errorDetails = getProkeralaErrorDetails(error);
        console.error(
            "Prokerala Panchang Error:",
            JSON.stringify(errorDetails, null, 2)
        );
        res.status(500).json({
            success: false,
            message: "Failed to fetch panchang from Prokerala",
            error: error.message,
        });
    }
};

export const getMuhurta = async (req, res) => {
    try {
        const { date, coordinates, timezoneOffset } = req.body || {};

        const endpoint = process.env.PROKERALA_MUHURTA_ENDPOINT;

        if (!endpoint) {
            return res.status(500).json({
                success: false,
                message:
                    "Prokerala muhurta endpoint is not configured. Please set PROKERALA_MUHURTA_ENDPOINT.",
            });
        }

        const coords =
            coordinates ||
            "23.1765,75.7885";

        const isoDate = date || new Date().toISOString().slice(0, 10);
        const year = isoDate.split("-")[0];
        const offset = timezoneOffset || "+05:30";
        let datetime;
        if (process.env.PROKERALA_SANDBOX_MODE === "true") {
            datetime = `${year}-01-01T00:00:00${offset}`;
        } else {
            datetime = `${isoDate}T00:00:00${offset}`;
        }

        const params = {
            ayanamsa: 1,
            coordinates: coords,
            datetime,
            la: "en",
        };

        const prokeralaResponse = await callProkerala(endpoint, params, "GET");

        res.status(200).json({
            success: true,
            data: prokeralaResponse.data || prokeralaResponse,
        });
    } catch (error) {
        const errorDetails = getProkeralaErrorDetails(error);
        console.error(
            "Prokerala Muhurta Error:",
            JSON.stringify(errorDetails, null, 2)
        );
        res.status(500).json({
            success: false,
            message: "Failed to fetch muhurta from Prokerala",
            error: error.message,
        });
    }
};

export const getNumerology = async (req, res) => {
    try {
        const { dateOfBirth, name } = req.body || {};

        const endpoint = process.env.PROKERALA_NUMEROLOGY_ENDPOINT;

        if (!endpoint) {
            return res.status(500).json({
                success: false,
                message:
                    "Prokerala numerology endpoint is not configured. Please set PROKERALA_NUMEROLOGY_ENDPOINT.",
            });
        }

        // Life path number requires a datetime; ignore time zone nuances and use midnight UTC.
        if (!dateOfBirth) {
            return res.status(400).json({
                success: false,
                message: "dateOfBirth is required for numerology life-path-number.",
            });
        }

        // Life path number is calculated from actual date digit sum — sandbox just needs a valid datetime
        // We always send the real date; Prokerala numerology is not date-range-restricted like horoscope
        const datetime = `${dateOfBirth}T00:00:00+05:30`;

        const params = { datetime };

        const prokeralaResponse = await callProkerala(endpoint, params, "GET");

        res.status(200).json({
            success: true,
            data: prokeralaResponse.data || prokeralaResponse,
        });
    } catch (error) {
        const errorDetails = getProkeralaErrorDetails(error);
        console.error(
            "Prokerala Numerology Error:",
            JSON.stringify(errorDetails, null, 2)
        );
        res.status(500).json({
            success: false,
            message: "Failed to fetch numerology data from Prokerala",
            error: error.message,
        });
    }
};

export const getTransitForecast = async (req, res) => {
    try {
        const { payload } = req.body || {};

        const endpoint = process.env.PROKERALA_TRANSIT_PLANET_ENDPOINT;

        if (!endpoint) {
            return res.status(500).json({
                success: false,
                message:
                    "Prokerala transit endpoint is not configured. Please set PROKERALA_TRANSIT_PLANET_ENDPOINT.",
            });
        }

        const dateOfBirth = payload?.dateOfBirth;
        const birthTime = payload?.birthTime;

        if (!dateOfBirth || !birthTime) {
            return res.status(400).json({
                success: false,
                message: "dateOfBirth and birthTime are required for transit forecast.",
            });
        }

        const natalCoords =
            payload?.coordinates ||
            (payload?.latitude && payload?.longitude
                ? `${payload.latitude},${payload.longitude}`
                : "23.1765,75.7885");

        const tzOffset = payload?.timezoneOffset || "+05:30";
        let natalDatetime;
        if (process.env.PROKERALA_SANDBOX_MODE === "true") {
            const [year] = dateOfBirth.split("-");
             natalDatetime = `${year}-01-01T${birthTime}:00${tzOffset}`;
        } else {
             natalDatetime = `${dateOfBirth}T${birthTime}:00${tzOffset}`;
        }

        // Transit time: now, in UTC, as per Prokerala bounds
        const now = new Date();
        const transitIsoDateTime = now.toISOString().slice(0, 19) + "+00:00";

        const params = {
            profile: {
                datetime: natalDatetime,
                coordinates: natalCoords,
            },
            transit_datetime: transitIsoDateTime,
            current_coordinates: natalCoords,
        };

        const prokeralaResponse = await callProkerala(endpoint, params, "GET");

        res.status(200).json({
            success: true,
            data: prokeralaResponse.data || prokeralaResponse,
        });
    } catch (error) {
        const errorDetails = getProkeralaErrorDetails(error);
        console.error(
            "Prokerala Transit Forecast Error:",
            JSON.stringify(errorDetails, null, 2)
        );
        res.status(500).json({
            success: false,
            message: "Failed to fetch transit forecast from Prokerala",
            error: error.message,
        });
    }
};

// Note: Current Prokerala v2 spec in this project does not expose a Tarot API.
// This endpoint exists so the frontend has a dedicated Tarot route instead of reusing daily horoscope.
export const getTarotReading = async (_req, res) => {
    try {
        const cards = [
            { name: "The Magician", prediction: "The Magician represents manifestation, resourcefulness, power, and inspired action. This is a time of great potential." },
            { name: "The High Priestess", prediction: "The High Priestess signifies intuition, sacred knowledge, divine feminine, and the subconscious mind." },
            { name: "The Empress", prediction: "The Empress represents femininity, beauty, nature, nurturing, and abundance." },
            { name: "The Emperor", prediction: "The Emperor signifies authority, establishment, structure, and a father figure." },
            { name: "The Lovers", prediction: "The Lovers represent love, harmony, relationships, values alignment, and choices." },
            { name: "The Chariot", prediction: "The Chariot signifies control, willpower, success, action, and determination." },
            { name: "The Strength", prediction: "Strength represents strength, courage, persuasion, influence, and compassion." },
            { name: "The Hermit", prediction: "The Hermit signifies soul-searching, introspection, being alone, and inner guidance." },
            { name: "Wheel of Fortune", prediction: "The Wheel of Fortune represents good luck, karma, life cycles, destiny, and a turning point." },
            { name: "Justice", prediction: "Justice signifies justice, fairness, truth, cause and effect, and law." }
        ];
        
        const randomCard = cards[Math.floor(Math.random() * cards.length)];
        
        res.status(200).json({
            success: true,
            data: {
                cardName: randomCard.name,
                reading: randomCard.prediction,
                date: new Date().toISOString().split('T')[0]
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

