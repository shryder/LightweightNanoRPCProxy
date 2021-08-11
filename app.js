const express = require('express');
const app = express();
const fs = require('fs');

const LOGS_FILE = "./logs.json";

if (!fs.existsSync(LOGS_FILE)) {
	console.info("Log file not found, creating...");
	fs.writeFileSync(LOGS_FILE, JSON.stringify({}));
	console.info("Log file created!");
}

let STATS = require(LOGS_FILE);

const {
	AVAILABLE_ACTIONS,
	REQUESTS_LIMIT,
	USERS,
	PORT,
	API_ROUTE,
	NODE_RPC,
	LOG_DATA,
	TRUST_PROXY,
	SUPER_IPS,
	MAX_ACTIONS_COUNT,
	MAX_REQUESTED_ACCOUNTS_COUNT
} = require('./config.json');

const DEFAULT_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
	'Content-Type': 'application/json'
};

const { RateLimiterMemory } = require('rate-limiter-flexible');
const rateLimiter = new RateLimiterMemory({
	points: REQUESTS_LIMIT,
	duration: 3600,
});

const NanoClient = require('nano-node-rpc');
const client = new NanoClient({ url: NODE_RPC });

app.use(express.json());

if (TRUST_PROXY) {
	app.set('trust proxy', true);
}

function setRateLimitHeaders(res, rateLimiterRes) {
	res.set({
		"Retry-After": rateLimiterRes.msBeforeNext / 1000,
		"X-RateLimit-Limit": REQUESTS_LIMIT,
		"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
		"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
	});
}

function clamp(number, min, max) {
	return Math.max(min, Math.min(number, max));
}

/**
 * Returns user object if token is valid, returns undefined if invalid token is provided
 * @param {string} token 
 */
function getUserByToken(token) {
	return USERS.find(user => user.token == token);
}

if (LOG_DATA) {
	// Save logs every 1 minute
	setInterval(() => {
		fs.writeFile('logs.json', JSON.stringify(STATS, null, "\t"), (err) => {
			if (err) console.error("Error writing stats to file.", err);
		});
	}, 60 * 1000);
}

async function handleRPCRequest(req, res) {
	res.set(DEFAULT_HEADERS);

	let body = {};
	if (req.method === "POST") {
		body = req.body;
	} else if (req.method === "GET") {
		body = req.query;
	}

	if (LOG_DATA) {
		res.on('finish', function(e){
			if(req.ip in STATS) {
				if (res.statusCode in STATS[req.ip]) {
					STATS[req.ip][res.statusCode] = STATS[req.ip][res.statusCode] + 1;
				} else {
					STATS[req.ip][res.statusCode] = 1;
				}
	
				STATS[req.ip].lastRequest = Date.now();
			} else {
				STATS[req.ip] = {
					[res.statusCode]: 1,
					firstRequest: Date.now(),
					lastRequest: Date.now()
				};
			}
		});
	}

	if (!("action" in body)) {
		return res.status(422).json({
			message: "Action field is required"
		});
	}

	const action = body.action;
	const authorization_header = req.header('Authorization');

	let allowed_actions = [...AVAILABLE_ACTIONS];

	if (!SUPER_IPS.includes(req.ip)) {
		if (authorization_header) {
			let user = getUserByToken(authorization_header);

			if (user) {
				allowed_actions = allowed_actions.concat(user.extra_available_actions);
			} else {
				return res.status(403).json({
					message: "Invalid authorization token provided."
				});
			}
		} else {
			try {
				const rateLimiterRes = await rateLimiter.consume(req.ip, 1);
	
				setRateLimitHeaders(res, rateLimiterRes);
			} catch (rateLimiterRes) {
				setRateLimitHeaders(res, rateLimiterRes);
	
				return res.status(429).json({
					message: "Too Many Requests"
				});
			}
		}
	}

	if (!allowed_actions.includes(action)) {
		return res.status(403).json({
			message: "Action is not allowed"
		});
	}

	let params = Object.assign({ }, body);
	delete params.action;

	// Make sure "count" param is not too high for configured actions
	if (action in MAX_ACTIONS_COUNT && !isNaN(MAX_ACTIONS_COUNT[action])) {
		params.count = clamp(params.count, 0, MAX_ACTIONS_COUNT[action]);
	}

	// Make sure "accounts" array does not have too high amount of accounts for configured actions
	if (action in MAX_REQUESTED_ACCOUNTS_COUNT && !isNaN(MAX_REQUESTED_ACCOUNTS_COUNT[action])) {
		params.accounts = params.accounts.slice(0, MAX_REQUESTED_ACCOUNTS_COUNT[action]);
	}

	try {
		const rpc_response = await client._send(action, params);
		return res.json(rpc_response);
	} catch (e) {
		return res.status(503).json({
			error: "Something wrong happened, maybe the NANO node is currently down"
		});
	}
}

if (API_ROUTE !== "/") {
	app.get('/', (req, res) => {
		return res.json({
			message: "RPC requests are supposed to be sent to " + API_ROUTE
		});
	});
}


app.get(API_ROUTE, handleRPCRequest);
app.post(API_ROUTE, handleRPCRequest);

app.listen(PORT, () => {
	console.log(`RPC handler app listening at port ${PORT}`)
});
