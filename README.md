# LightweightNanoRPCProxy

This is a web server that acts as a middleman between the user and the actual NANO node in order to limit the allowed RPC actions and adds rate limit and basic logging. 

## Setup
Rename config.example.json to config.json and change values accordingly.

Then run: 
```
npm install
```

```
node app.js
```

## Configurable options

* `LOG_DATA`: Logs the returned HTTP statuses that each user received and first/last request date.
* `NODE_RPC`: Node RPC url.
* `API_ROUTE`: Customize target api route.
* `PORT`: Port this proxy web server will run.
* `AVAILABLE_ACTIONS`: Array of allowed RPC actions.
* `REQUESTS_LIMIT`: Amount of requests each IP is allowed to make per hour.
* `USERS`: Array of users.
  * `username`: Just an alias, not actually used (yet?)
  * `token`: Randomly generated token that is supposed to be sent in the Authorization header (eg: `Authorization: random_string_here`)
  * `extra_available_actions`: You can add extra actions that this user can run.
  * **NOTE: All authorized users bypass the rate limiter completely.**
