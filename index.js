const { setIntervalAsync } = require('set-interval-async/dynamic')
const { clearIntervalAsync } = require('set-interval-async')
const Discord = require("discord.js");
const axios = require("axios");
const bot = new Discord.Client();
const token = ""; //Discord API token
let users = {};
// Twitch.tv API Request values
const config = (parameters) => ({
    headers: {
        "Client-ID": "" //Twitch.tv API token
    },
    params: parameters //Twitch.tv streams to be checked
});
// Reddit API Request values
const postConfig = {
    headers: {
        Authorization: "Bearer"
    },
    params: {
        limit: "5" // Amount of new posts to search from subreddit
    }
}

class User {
    constructor(channel) {
        this.streams = {}; // Currently tracked Twitch.tv streams with stream names as keys and a string that's either "online" or "offline"
        this.channel = channel; // User's Discord chat channel
        this.on = false; // Tracks whether the tracker is on or off
        this.posts = {}; // Reddit posts object with subreddits as keys and an array of terms for values
        this.sentDeals = []; // Holds previously sent Reddit posts for 24hrs
        this.intervalId; // Interval ID for tracker
        this.dealsInterval = setInterval(() => {
            this.sentDeals = []
        }, 86400000) // Clears the previously sent Reddit messages every 24hrs
    }

    // Runs the tracker for Reddit and Twitch to check new subreddit posts for the tracked terms and check tracked streams to see if they're online or offline
    checkThings() {
        if (Object.keys(this.posts).length === 0 && Object.keys(this.streams).length === 0) {
            this.channel.send("Tracker deactivated due to nothing being tracked");
            this.on = false;
            return clearIntervalAsync(this.intervalId);
        }

        if (Object.keys(this.posts).length > 0) {
            this.trackPosts();
        }
        
        if (Object.keys(this.streams).length > 0) {
            this.checkStreams();
        };
    }

    // Add a subreddit + search term to track within the new posts of that subreddit
    async addSearch(info) {
        const subreddit = info[0].toLowerCase();
        const term = info[1].toLowerCase();
        let response;

        try {
            response = await axios.get(`http://oauth.reddit.com/r/${subreddit}/new.json`, postConfig);
        } catch {
            this.channel.send("Invalid subreddit")
            return
        };

        if (this.posts[subreddit]) {
            this.posts[subreddit].push(term);
            this.channel.send(`Tracking ${term} in ${subreddit}`)
        }
        else {
            this.posts[subreddit] = [term]
            this.channel.send(`Tracking ${term} in ${subreddit}`)
        };
    }

    // Remove a subreddit search term or subreddit to search from
    async removeSearch(info) {
        const subreddit = info[0].toLowerCase();
        const term = info[1].toLowerCase();

        if (!Object.keys(this.posts).includes(subreddit)) {
            this.channel.send("Subreddit is not being tracked");
            return;
        };

        if (term) {
            let index = this.posts[subreddit].indexOf(term);
            this.posts[subreddit].splice(index, 1);
            if (this.posts[subreddit].length === 0) {
                delete this.posts[subreddit];
            }
        }
        else {
            delete this.posts[subreddit];
        };
    }

    // Check subreddit's newest posts to see if any of the titles contain a tracked term
    async trackPosts() {
        for (let subreddit of Object.keys(this.posts)) {
            let response = await axios.get(`http://oauth.reddit.com/r/${subreddit}/new.json`, postConfig);
            for (let post of response.data.data.children) {
                for (let term of this.posts[subreddit]) {
                    if (post.data.title.toLowerCase().includes(term.toLowerCase())) {
                        const message = `https://old.reddit.com${post.data.permalink}`;
                        if (!this.sentDeals.includes(message)) {
                            this.sentDeals.push(message);
                            this.channel.send(message);
                            break;
                        }
                    }
                }
            }
        }
    }

    // Adds a stream to be tracked
    async addStream(stream) {
        let newStream = [];
        
        for (let s of stream) {
            s.toLowerCase();
            newStream.push(s);

            if (Object.keys(this.streams).includes(s)) {
                this.channel.send("That stream is already being tracked");
                return;
            };
        };

        const streamParam = {
            "login": newStream
        };

        let response;
        try {
            response = await axios.get("https://api.twitch.tv/helix/users", config(streamParam));
        } catch {
            this.channel.send("Invalid stream");
            return;
        }
    
        if (response.data.data.length === 0) {
            this.channel.send("Stream not found");
            return;
        };

        for (let streamInfo of response.data.data) {
            this.channel.send(`Added ${streamInfo.display_name} to tracker`)
            this.streams[streamInfo.display_name.toLowerCase()] = "offline";
        }
    }

    // Remove a tracked stream
    removeStream(stream) {
        for (let s of stream) {
            if (!Object.keys(this.streams).includes(s.toLowerCase())) {
                this.channel.send("That stream is not being tracked");
                return;
            }
        }

        for (let s of stream) {
            this.channel.send("Stream removed");
            delete this.streams[s.toLowerCase()];
        }
    }

    // Check to see if a stream is live, if the stream was previously offline, a notification will be sent to the chat channel
    async checkStreams() {
        const liveParam = {
            "user_login": Object.keys(this.streams)
        };
    
        const response = await axios.get("https://api.twitch.tv/helix/streams", config(liveParam));
    
        const streamsData = response.data.data;
        let liveStreams = [];
        
        for (let streamData of streamsData) {
            const streamName = streamData.user_name;
            liveStreams.push(streamName.toLowerCase());

            if (this.streams[streamName.toLowerCase()] === "offline") {
                this.streams[streamName.toLowerCase()] = "online";
                this.channel.send(`${streamName} is live! https://www.twitch.tv/${streamName}`);
            }
        };

        for (let stream in this.streams) {
            if (!liveStreams.includes(stream)) {
                this.streams[stream] = "offline";
            }
        };
    }

    // Activate the tracker
    activate() {
        if (Object.keys(this.streams).length === 0) {
            this.channel.send('Please add streams first before activating');
            return;
        }
        if (this.on === false) {
            this.channel.send('Tracker activated');
            this.on = true;
            this.intervalId = setIntervalAsync(this.checkThings.bind(this), 60000);
        } else {
            this.channel.send("Tracker is already active");
        };
    }

    // Deactivate the tracker
    deactivate() {
        if (this.on === true) {
            this.channel.send('Tracker deactivated');
            this.on = false;
            clearIntervalAsync(this.intervalId);
        } else {
            this.channel.send("Tracker is already deactivated");
        };
    }
}


bot.login(token);

// Activates bot and allows it to receive text commands
bot.on("message", async (msg) => {
    if (msg.author.username != "Stream Tracker") {
        const author = msg.author.id;
        if (!Object.keys(users).includes(msg.author.id)) {
            users[author] = new User(msg.channel);
        }
        if (msg.content.startsWith("!activate")) {
            users[author].activate();
        }
        else if (msg.content.startsWith("!deactivate")) {
            users[author].deactivate();
        }
        else if (msg.content.startsWith("!add ")) {
            users[author].addStream(msg.content.slice(5).replace(/ /g, '').split(','));
        }
        else if (msg.content.startsWith("!remove ")) {
            users[author].removeStream(msg.content.slice(8).replace(/ /g, '').split(','));
        }
        else if (msg.content.startsWith("!addsearch ")) {
            users[author].addSearch(msg.content.slice(11).split(' '));
        }
        else if (msg.content.startsWith("!removesearch ")) {
            users[author].removeSearch(msg.content.slice(14).split(' '));
        }
    }
})