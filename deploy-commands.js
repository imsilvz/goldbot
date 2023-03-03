import { SlashCommandBuilder, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import dotenv from 'dotenv';
dotenv.config();

const commands = [
	new SlashCommandBuilder()
		.setName('pricealert')
		.setDescription('Sets a threshold for a price alert')
		.addNumberOption(option =>
			option
			.setName("threshold")
			.setDescription("The price threshold to alert on in USD.")
			.setRequired(true)),
	new SlashCommandBuilder()
		.setName("clearpricealerts")
		.setDescription('Clears your current price alert')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT), { body: commands })
.then((data) => console.log(`Successfully registered ${data.length} application commands.`))
.catch(console.error);