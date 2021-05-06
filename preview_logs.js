const logs = require('./logs.json');
let total_requests = 0;

for (const [key, value] of Object.entries(logs)) {
	for (const [sub_key, value] of Object.entries(logs[key])) {
		if(sub_key != "firstRequest" && sub_key != "lastRequest") {
			total_requests += value;
		}
	}

	logs[key].firstRequest = new Date(logs[key].firstRequest);
	logs[key].lastRequest = new Date(logs[key].lastRequest);
}

console.table(logs);
console.log("Total Requests: ", total_requests);