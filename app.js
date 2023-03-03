// Require the necessary discord.js classes
import { 
	ActionRowBuilder, ButtonBuilder, ButtonStyle,
	Client, EmbedBuilder, GatewayIntentBits
} from 'discord.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

// initialize database object
import { db } from './database.js';

// graph objects
import { GetDailyImage, GetWeeklyImage } from './graphs.js';

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once)
var timer = null;
client.once('ready', async () => {
	console.log('Bot Started');

	// debug
	console.log(await db.all('SELECT * FROM users'));

	// set presence
	client.user.setPresence({ 
		activities: [{ 
			name: 'the gold markets'
		}], 
		status: 'online' 
	});

	// begin main app loop
	await BotLoop();
	timer = setInterval(BotLoop, 1000 * 60);
});

var lastPrice = 0;
var lastPriceLink = null;
const BotLoop = async () => {
	// fetch gold price
	let { price, priceLink, serverInfo } = await GetGoldPrice();
	let guilds = await client.guilds.fetch();
	for(let guild of guilds) {
		// update nickname in all discord servers
		let guildObject = await guild[1].fetch();
		let bot = guildObject.members.me;
		await bot.setNickname(`Gold: \$${price}`);
	}
	// store into history table
	await db.run('INSERT INTO history (timestamp, price) VALUES (?, ?)', Date.now(), price);
	lastPrice = price;
	lastPriceLink = priceLink;

	// query all users who may need to be alerted
	let alerts = await db.all(
		'SELECT * FROM users WHERE ? <= thresh AND ? != price',
		price, price
	);
	for(let alert of alerts) {
		// fetch discord user and dm them
		let discordUser = await client.users.fetch(alert.id);
		let dmChannel = await discordUser.createDM();
		dmChannel.send({
			embeds: [
				new EmbedBuilder()
				.setColor(0x845199)
				.setTitle("Your price alert has been triggered!")
				.setURL(priceLink)
				.setDescription(`Your price threshold: **\$${alert.thresh}**\nCurrent gold price: **\$${price}**`)
				.setTimestamp()
				.setFooter({ text: serverInfo.title })
			],
			components: [
				new ActionRowBuilder()
				.addComponents([
					new ButtonBuilder()
						.setCustomId('day')
						.setLabel('Daily History')
						.setStyle(ButtonStyle.Primary)
						.setEmoji('📈'),
					new ButtonBuilder()
						.setCustomId('week')
						.setLabel('Weekly History')
						.setStyle(ButtonStyle.Danger)
						.setEmoji('📉')
				])
			]
		});
		// store alerted status
		await db.run('UPDATE users SET alerted = TRUE, price = ? WHERE id = ?', price, alert.id);
	}
	// reset alerts for other users
	await db.run('UPDATE users SET alerted = FALSE WHERE thresh < ?', price);
}

const GetGoldPrice = async () => {
	let brand = null;
	let region = null;
	let service = null;
	let country = "US";
	let currency = "USD";
	let pageSize = null;
	let keywords = await fetch("https://assets.g2g.com/offer/keyword.json");
	let keywordsJson = await keywords.json();
	for(let keyword in keywordsJson) {
		let key = keywordsJson[keyword];

		// g2g service
		if(key.seo_term && key.seo_term == "game-coins") {
			service = keyword;
		}

		// g2g region
		if(key.en && key.en == "US") {
			region = keyword;
		}

		// brand / game
		if(key.seo_term && key.seo_term == "wow-classic") {
			brand = keyword;
		}
	}

	// query number of search results
	let resultCountUrl = new URL("https://sls.g2g.com/offer/search_result_count");
	resultCountUrl.searchParams.append("service_id", service);
	resultCountUrl.searchParams.append("region_id", region);
	resultCountUrl.searchParams.append("brand_id", brand);
	resultCountUrl.searchParams.append("country", country);
	resultCountUrl.searchParams.append("currency", currency);
	let resultCount = await fetch(resultCountUrl.toString());
	let resultCountJson = await resultCount.json();
	pageSize = resultCountJson.payload.total_result;

	// search offers
	let g2gSearchUrl = new URL("https://sls.g2g.com/offer/search");
	g2gSearchUrl.searchParams.append("service_id", service);
	g2gSearchUrl.searchParams.append("region_id", region);
	g2gSearchUrl.searchParams.append("brand_id", brand);
	g2gSearchUrl.searchParams.append("country", country);
	g2gSearchUrl.searchParams.append("currency", currency);
	g2gSearchUrl.searchParams.append("page_size", pageSize);
	g2gSearchUrl.searchParams.append("sort", "lowest_price");
	let g2gSearch = await fetch(g2gSearchUrl.toString());
	let g2gSearchJson = await g2gSearch.json();
	let g2gSearchResults = g2gSearchJson.payload.results;

	if(!g2gSearchResults) { console.log(g2gSearchJson); }

	// find grobbulus
	for(let server of g2gSearchResults) {
		if(server.title == "Grobbulus [US] - Alliance") {
			let offerAttrib = server.offer_attributes[0];
			let filterAttrib = `${offerAttrib.collection_id}:${offerAttrib.dataset_id}`;
			let offerLink = new URL("https://www.g2g.com/offer/Grobbulus--US----Alliance");
			offerLink.searchParams.append("service_id", service);
			offerLink.searchParams.append("region_id", region);
			offerLink.searchParams.append("brand_id", brand);
			offerLink.searchParams.append("fa", filterAttrib);
			offerLink.searchParams.append("sort", "lowest_price");
			offerLink.searchParams.append("include_offline", 1);
			return {
				price: server.converted_unit_price,
				priceLink: offerLink.toString(),
				serverInfo: server
			}
		}
	}
}

client.on('interactionCreate', async interaction => {
	if(interaction.isChatInputCommand())
	{	let userId = interaction.user.id;
		switch(interaction.commandName) {
			case "pricealert":
				let thresh = interaction.options.getNumber('threshold', true);
				interaction.reply({ 
					content: `Your price alert has been set to: \$${thresh}.`, 
					ephemeral: true 
				});
				console.log("PRICEALERT", userId, await db.run(
					`INSERT INTO users (id, thresh, price, alerted) VALUES (?, ?, ?, ?)
					ON CONFLICT(id) DO 
					UPDATE SET thresh=EXCLUDED.thresh, price=EXCLUDED.price, alerted=EXCLUDED.alerted`,
					userId,
					thresh,
					0,
					false
				));
				break;
			case "clearpricealerts":
				interaction.reply({ 
					content: "Your price alerts has been cleared.", 
					ephemeral: true 
				});
				console.log("CLEARPRICEALERTS", userId, await db.run(
					'DELETE FROM users WHERE id = ?',
					userId
				));
				break;
			default:
				interaction.reply({ content: "Unknown Command", ephemeral: true });
		}
	} else if(interaction.isButton()) {
		switch(interaction.customId) {
			case 'day':
				interaction.reply({
					files: [await GetDailyImage()],
					ephemeral: true
				});
				break;
			case 'week':
				interaction.reply({
					files: [await GetWeeklyImage()],
					ephemeral: true
				});
				break;
			default:
				interaction.reply({ content: "Unknown Command", ephemeral: true });
		}
	} else {
		return;
	}
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);