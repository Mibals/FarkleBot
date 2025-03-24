const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const activeGames = new Map();
const GAME_TIMEOUT = 30 * 60 * 1000;

const SCORING_RULES = {
    '1': 100, '5': 50,
    '111': 1000, '222': 200, '333': 300, '444': 400, '555': 500, '666': 600,
    '1111': 2000, '2222': 400, '3333': 600, '4444': 800, '5555': 1000, '6666': 1200,
    '11111': 3000, '22222': 600, '33333': 900, '44444': 1200, '55555': 1500, '66666': 1800,
    '111111': 4000, '222222': 800, '333333': 1200, '444444': 1600, '555555': 2000, '666666': 2400,
    '123456': 1500,
    '12345': 500,  // Add 1-5 straight
    '23456': 750   // Add 2-6 straight
};

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    setInterval(() => {
        const now = Date.now();
        for (const [channelId, game] of activeGames.entries()) {
            if (now - game.lastActivity > GAME_TIMEOUT) {
                console.log(`Cleaning up inactive game in channel ${channelId}`);
                activeGames.delete(channelId);
            }
        }
    }, 5 * 60 * 1000);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.toLowerCase();

    if (content === '!farkle') {
        if (!message.guild) return message.reply("This command can only be used in a server.");
        const botMember = message.guild.members.cache.get(client.user.id);
        const requiredPermissions = [
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ViewChannel
        ];
        const missingPermissions = requiredPermissions.filter(perm => !botMember.permissions.has(perm));
        if (missingPermissions.length > 0) return message.reply("I need permissions to send messages and embed links.");
        if (activeGames.has(message.channelId)) return message.reply("There's already an active game in this channel.");

        const embed = new EmbedBuilder()
            .setTitle('Farkle')
            .setDescription('Challenge someone to a game of Farkle!')
            .setColor(0x0099FF);
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('start_game').setLabel('Start Game').setStyle(ButtonStyle.Primary)
            );
        await message.channel.send({ embeds: [embed], components: [row] });
    } else if (content === '!quit') {
        const game = activeGames.get(message.channelId);
        if (!game) return message.reply("There's no active game to quit.");
        const currentPlayer = game.players[game.currentTurn];
        if (currentPlayer.id !== message.author.id) return message.reply("You can only quit on your turn.");

        activeGames.delete(message.channelId);
        const embed = new EmbedBuilder()
            .setTitle('Farkle: Game Ended')
            .setDescription(`${currentPlayer.name} has quit the game.`)
            .addFields(
                { name: `${game.players[0].name}'s Score`, value: game.players[0].score.toString(), inline: true },
                { name: `${game.players[1]?.name || 'Opponent'}'s Score`, value: (game.players[1]?.score || 0).toString(), inline: true }
            )
            .setColor(0xFF0000);
        await message.channel.send({ embeds: [embed] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    try {
        const { customId } = interaction;
        if (customId === 'start_game') await handleStartGame(interaction);
        else if (customId.startsWith('join_')) await handleJoinGame(interaction);
        else if (customId === 'roll_dice') await handleRollDice(interaction);
        else if (customId.startsWith('select_')) await handleSelectDie(interaction);
        else if (customId === 'bank_points') await handleBankPoints(interaction);
        else if (customId === 'reset_selection') await handleResetSelection(interaction);
    } catch (error) {
        console.error('Error handling interaction:', error.stack);
        await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
});

async function handleStartGame(interaction) {
    if (activeGames.has(interaction.channelId)) return interaction.reply({ content: "There's already an active game.", ephemeral: true });
    activeGames.set(interaction.channelId, {
        hostId: interaction.user.id,
        players: [{ id: interaction.user.id, name: interaction.user.username, score: 0 }],
        status: 'waiting',
        currentTurn: 0,
        currentRoll: [],
        selectedDice: [],
        turnScore: 0,
        accumulatedScore: 0,
        lastActivity: Date.now()
    });
    const embed = new EmbedBuilder()
        .setTitle('Farkle: Looking for Players')
        .setDescription(`${interaction.user.username} is starting a game!`)
        .setColor(0x0099FF);
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`join_${interaction.channelId}`).setLabel('Join Game').setStyle(ButtonStyle.Success)
        );
    await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleJoinGame(interaction) {
    const channelId = interaction.customId.split('_')[1];
    const game = activeGames.get(channelId);
    if (!game) return interaction.reply({ content: "Game expired.", ephemeral: true });
    if (game.status !== 'waiting') return interaction.reply({ content: "Game already started.", ephemeral: true });
    if (game.players.some(p => p.id === interaction.user.id)) return interaction.reply({ content: "You're already in.", ephemeral: true });
    game.players.push({ id: interaction.user.id, name: interaction.user.username, score: 0 });
    game.status = 'playing';
    game.lastActivity = Date.now();

    const embed = new EmbedBuilder()
        .setTitle(`Farkle: ${game.players[0].name}'s Turn`)
        .setDescription(`Game between ${game.players[0].name} and ${game.players[1].name}. Roll to start!`)
        .addFields(
            { name: `${game.players[0].name}'s Score`, value: '0', inline: true },
            { name: `${game.players[1].name}'s Score`, value: '0', inline: true }
        )
        .setColor(0x0099FF);
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('roll_dice').setLabel('Roll Dice').setStyle(ButtonStyle.Primary)
        );
    await interaction.update({ embeds: [embed], components: [row] });
}

async function handleRollDice(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game) return interaction.reply({ content: "No active game.", ephemeral: true });
    const currentPlayer = game.players[game.currentTurn];
    if (currentPlayer.id !== interaction.user.id) return interaction.reply({ content: "Not your turn.", ephemeral: true });
    game.lastActivity = Date.now();

    console.log(`Before roll: currentRoll=${game.currentRoll}, selectedDice=${game.selectedDice}, accumulatedScore=${game.accumulatedScore}`);

    if (game.currentRoll.length === 0 && game.selectedDice.length === 0 && game.accumulatedScore === 0) {
        // First roll of the turn
        game.currentRoll = Array.from({ length: 6 }, () => Math.floor(Math.random() * 6) + 1);
        console.log(`First roll: currentRoll=${game.currentRoll}`);
        if (!canScoreAny(game.currentRoll)) {
            game.turnScore = 0;
            game.accumulatedScore = 0;
            game.currentRoll = [];
            game.selectedDice = [];
            game.currentTurn = (game.currentTurn + 1) % game.players.length;
            const nextPlayer = game.players[game.currentTurn];
            const embed = new EmbedBuilder()
                .setTitle('Farkle: FARKLE!')
                .setDescription(`${currentPlayer.name} farkled on their first roll! ${nextPlayer.name}'s turn.`)
                .addFields(
                    { name: 'Last Roll', value: formatDiceRoll(game.currentRoll), inline: false },
                    { name: `${game.players[0].name}'s Score`, value: game.players[0].score.toString(), inline: true },
                    { name: `${game.players[1].name}'s Score`, value: game.players[1].score.toString(), inline: true }
                )
                .setColor(0xFF0000);
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('roll_dice').setLabel('Roll Dice').setStyle(ButtonStyle.Primary)
                );
            return await interaction.update({ embeds: [embed], components: [row] });
        }
    } else {
        // Handle subsequent rolls
        if (game.selectedDice.length === 0) {
            return interaction.reply({ content: "You must select valid dice before rolling again.", ephemeral: true });
        }

        const { validDice, score } = extractValidDice(game.selectedDice);
        console.log(`After extractValidDice: validDice=${validDice}, score=${score}`);
        if (validDice.length === 0) {
            game.turnScore = 0;
            game.accumulatedScore = 0;
            game.currentRoll = [];
            game.selectedDice = [];
            game.currentTurn = (game.currentTurn + 1) % game.players.length;
            const nextPlayer = game.players[game.currentTurn];
            const embed = new EmbedBuilder()
                .setTitle('Farkle: FARKLE!')
                .setDescription(`${currentPlayer.name} farkled! ${nextPlayer.name}'s turn.`)
                .addFields(
                    { name: 'Last Roll', value: formatDiceRoll(game.currentRoll), inline: false },
                    { name: 'Selected Dice', value: formatDiceRoll(game.selectedDice), inline: false },
                    { name: `${game.players[0].name}'s Score`, value: game.players[0].score.toString(), inline: true },
                    { name: `${game.players[1].name}'s Score`, value: game.players[1].score.toString(), inline: true }
                )
                .setColor(0xFF0000);
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('roll_dice').setLabel('Roll Dice').setStyle(ButtonStyle.Primary)
                );
            return await interaction.update({ embeds: [embed], components: [row] });
        }

        if (validDice.length < game.selectedDice.length) {
            return interaction.reply({ content: "Error: Invalid dice selected. Only valid dice can be rolled. Reset to proceed.", ephemeral: true });
        }

        game.accumulatedScore += score;
        game.turnScore = 0;
        game.selectedDice = [];
        console.log(`After clearing selectedDice: currentRoll=${game.currentRoll}`);

        // Roll remaining dice, reset to 6 if none left
        const diceToRoll = game.currentRoll.length > 0 ? game.currentRoll.length : 6;
        console.log(`Rolling ${diceToRoll} dice, currentRoll was: ${game.currentRoll}`);
        game.currentRoll = [];
        for (let i = 0; i < diceToRoll; i++) {
            game.currentRoll.push(Math.floor(Math.random() * 6) + 1);
        }
        console.log(`After roll: currentRoll=${game.currentRoll}`);

        if (!canScoreAny(game.currentRoll)) {
            game.turnScore = 0;
            game.accumulatedScore = 0;
            game.currentRoll = [];
            game.selectedDice = [];
            game.currentTurn = (game.currentTurn + 1) % game.players.length;
            const nextPlayer = game.players[game.currentTurn];
            const embed = new EmbedBuilder()
                .setTitle('Farkle: FARKLE!')
                .setDescription(`${currentPlayer.name} farkled! ${nextPlayer.name}'s turn.`)
                .addFields(
                    { name: 'Last Roll', value: formatDiceRoll(game.currentRoll), inline: false },
                    { name: `${game.players[0].name}'s Score`, value: game.players[0].score.toString(), inline: true },
                    { name: `${game.players[1].name}'s Score`, value: game.players[1].score.toString(), inline: true }
                )
                .setColor(0xFF0000);
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('roll_dice').setLabel('Roll Dice').setStyle(ButtonStyle.Primary)
                );
            return await interaction.update({ embeds: [embed], components: [row] });
        }
    }

    const rows = createDiceButtons(game);
    await interaction.update({ embeds: [gameEmbed(game)], components: rows });
}

async function handleSelectDie(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game) return interaction.reply({ content: "No active game.", ephemeral: true });
    const currentPlayer = game.players[game.currentTurn];
    if (currentPlayer.id !== interaction.user.id) return interaction.reply({ content: "Not your turn.", ephemeral: true });
    game.lastActivity = Date.now();

    const [_, indexStr] = interaction.customId.split('_');
    const index = parseInt(indexStr);
    if (index < 0 || index >= game.currentRoll.length) return interaction.reply({ content: "Invalid selection.", ephemeral: true });

    const die = game.currentRoll[index];
    game.selectedDice.push(die);
    game.currentRoll.splice(index, 1);
    game.turnScore = calculateScore(game.selectedDice);

    const rows = createDiceButtons(game);
    await interaction.update({ embeds: [gameEmbed(game)], components: rows });
}

async function handleBankPoints(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game) return interaction.reply({ content: "No active game.", ephemeral: true });
    const currentPlayer = game.players[game.currentTurn];
    if (currentPlayer.id !== interaction.user.id) return interaction.reply({ content: "Not your turn.", ephemeral: true });
    game.lastActivity = Date.now();

    const totalPoints = game.turnScore + game.accumulatedScore;
    if (totalPoints === 0) return interaction.reply({ content: "No points to bank.", ephemeral: true });

    game.players[game.currentTurn].score += totalPoints;
    if (game.players[game.currentTurn].score >= 5000) {
        const embed = new EmbedBuilder()
            .setTitle('Farkle: Game Over')
            .setDescription(`${currentPlayer.name} wins with ${game.players[game.currentTurn].score} points!`)
            .addFields(
                { name: `${game.players[0].name}'s Score`, value: game.players[0].score.toString(), inline: true },
                { name: `${game.players[1].name}'s Score`, value: game.players[1].score.toString(), inline: true }
            )
            .setColor(0xFFD700);
        activeGames.delete(interaction.channelId);
        await interaction.update({ embeds: [embed], components: [] });
        return;
    }

    game.turnScore = 0;
    game.accumulatedScore = 0;
    game.currentRoll = [];
    game.selectedDice = [];
    game.currentTurn = (game.currentTurn + 1) % game.players.length;
    const nextPlayer = game.players[game.currentTurn];
    const embed = new EmbedBuilder()
        .setTitle(`Farkle: ${nextPlayer.name}'s Turn`)
        .setDescription(`${currentPlayer.name} banked ${totalPoints} points. ${nextPlayer.name}'s turn.`)
        .addFields(
            { name: `${game.players[0].name}'s Score`, value: game.players[0].score.toString(), inline: true },
            { name: `${game.players[1].name}'s Score`, value: game.players[1].score.toString(), inline: true }
        )
        .setColor(0x0099FF);
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('roll_dice').setLabel('Roll Dice').setStyle(ButtonStyle.Primary)
        );
    await interaction.update({ embeds: [embed], components: [row] });
}

async function handleResetSelection(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game) return interaction.reply({ content: "No active game.", ephemeral: true });
    const currentPlayer = game.players[game.currentTurn];
    if (currentPlayer.id !== interaction.user.id) return interaction.reply({ content: "Not your turn.", ephemeral: true });
    game.lastActivity = Date.now();

    game.currentRoll = game.currentRoll.concat(game.selectedDice);
    game.selectedDice = [];
    game.turnScore = 0;

    const rows = createDiceButtons(game);
    await interaction.update({ embeds: [gameEmbed(game)], components: [rows] });
}

function gameEmbed(game) {
    const currentPlayer = game.players[game.currentTurn];
    return new EmbedBuilder()
        .setTitle(`Farkle: ${currentPlayer.name}'s Turn`)
        .setDescription("Select dice to score. Invalid selections block rolling until reset, unless all are invalid (farkle).")
        .addFields(
            { name: 'Current Roll', value: formatDiceRoll(game.currentRoll), inline: false },
            { name: 'Selected Dice', value: game.selectedDice.length > 0 ? formatDiceRoll(game.selectedDice) : 'None', inline: false },
            { name: 'Turn Score', value: `${game.turnScore + game.accumulatedScore}`, inline: true },
            { name: `${game.players[0].name}'s Score`, value: game.players[0].score.toString(), inline: true },
            { name: `${game.players[1].name}'s Score`, value: game.players[1].score.toString(), inline: true }
        )
        .setColor(0x0099FF);
}

function createDiceButtons(game) {
    const diceButtons = game.currentRoll.map((value, index) =>
        new ButtonBuilder()
            .setCustomId(`select_${index}`)
            .setLabel(`${value}`)
            .setStyle(ButtonStyle.Secondary)
    );
    const rows = [];
    for (let i = 0; i < diceButtons.length; i += 5) {
        const buttonsInRow = diceButtons.slice(i, i + 5);
        if (buttonsInRow.length > 0) rows.push(new ActionRowBuilder().addComponents(buttonsInRow));
    }
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('bank_points')
                .setLabel(`Bank Points (${game.turnScore + game.accumulatedScore})`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(game.turnScore + game.accumulatedScore === 0),
            new ButtonBuilder()
                .setCustomId('roll_dice')
                .setLabel(game.currentRoll.length === 0 ? 'Roll Again' : 'Roll Remaining')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('reset_selection')
                .setLabel('Reset Selection')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(game.selectedDice.length === 0)
        );
    rows.push(actionRow);
    return rows.slice(0, 5);
}

function formatDiceRoll(dice) {
    if (!dice || dice.length === 0) return 'None';
    const diceEmoji = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
    return dice.map(d => `${diceEmoji[d]} ${d}`).join(' ');
}

function canScoreAny(dice) {
    if (!dice || dice.length === 0) return false;
    if (dice.includes(1) || dice.includes(5)) return true;
    const counts = {};
    dice.forEach(die => counts[die] = (counts[die] || 0) + 1);
    for (const count of Object.values(counts)) if (count >= 3) return true;
    if (dice.length >= 6 && [...dice].sort((a, b) => a - b).join('') === '123456') return true;
    if (dice.length >= 5) {
        const sortedDice = [...dice].sort((a, b) => a - b);
        const firstFive = sortedDice.slice(0, 5).join('');
        if (firstFive === '12345' || firstFive === '23456') return true;
    }
    return false;
}

function calculateScore(dice) {
    if (!dice || dice.length === 0) return 0;
    let score = 0;
    let remainingDice = [...dice];

    // Check for 6-dice straight
    if (dice.length >= 6 && [...dice].sort((a, b) => a - b).join('') === '123456') {
        return SCORING_RULES['123456'];
    }
    // Check for 5-dice straights
    if (dice.length >= 5) {
        const sortedDice = [...dice].sort((a, b) => a - b);
        const firstFive = sortedDice.slice(0, 5).join('');
        if (firstFive === '12345') {
            remainingDice = sortedDice.slice(5);
            score += SCORING_RULES['12345'];
        } else if (firstFive === '23456') {
            remainingDice = sortedDice.slice(5);
            score += SCORING_RULES['23456'];
        }
    }

    // Check for three-of-a-kind or higher
    const counts = {};
    remainingDice.forEach(die => counts[die] = (counts[die] || 0) + 1);
    for (const [value, count] of Object.entries(counts)) {
        if (count >= 6) { score += SCORING_RULES[value.repeat(6)] || 0; remainingDice = remainingDice.filter(d => d !== parseInt(value)); }
        else if (count >= 5) { score += SCORING_RULES[value.repeat(5)] || 0; remainingDice = remainingDice.filter(d => d !== parseInt(value)); }
        else if (count >= 4) { score += SCORING_RULES[value.repeat(4)] || 0; remainingDice = remainingDice.filter(d => d !== parseInt(value)); }
        else if (count >= 3) { score += SCORING_RULES[value.repeat(3)] || 0; remainingDice = remainingDice.filter(d => d !== parseInt(value)); }
    }

    // Score remaining 1s and 5s
    remainingDice.forEach(die => {
        if (die === 1) score += SCORING_RULES['1'];
        if (die === 5) score += SCORING_RULES['5'];
    });

    return score;
}

function extractValidDice(dice) {
    if (!dice || dice.length === 0) return { validDice: [], score: 0 };
    let score = 0;
    let validDice = [];
    let remainingDice = [...dice];

    // Check for 6-dice straight
    if (dice.length >= 6 && [...dice].sort((a, b) => a - b).join('') === '123456') {
        return { validDice: dice, score: SCORING_RULES['123456'] };
    }

    // Check for 5-dice straights
    if (dice.length >= 5) {
        const sortedDice = [...dice].sort((a, b) => a - b);
        const firstFive = sortedDice.slice(0, 5).join('');
        if (firstFive === '12345') {
            score += SCORING_RULES['12345'];
            validDice = sortedDice.slice(0, 5);
            remainingDice = sortedDice.slice(5);
        } else if (firstFive === '23456') {
            score += SCORING_RULES['23456'];
            validDice = sortedDice.slice(0, 5);
            remainingDice = sortedDice.slice(5);
        }
    }

    // Check for three-of-a-kind or higher
    const counts = {};
    remainingDice.forEach(die => counts[die] = (counts[die] || 0) + 1);
    for (const [value, count] of Object.entries(counts)) {
        const num = parseInt(value);
        if (count >= 6) {
            score += SCORING_RULES[value.repeat(6)] || 0;
            validDice = validDice.concat(new Array(count).fill(num));
            remainingDice = remainingDice.filter(d => d !== num);
        } else if (count >= 5) {
            score += SCORING_RULES[value.repeat(5)] || 0;
            validDice = validDice.concat(new Array(count).fill(num));
            remainingDice = remainingDice.filter(d => d !== num);
        } else if (count >= 4) {
            score += SCORING_RULES[value.repeat(4)] || 0;
            validDice = validDice.concat(new Array(count).fill(num));
            remainingDice = remainingDice.filter(d => d !== num);
        } else if (count >= 3) {
            score += SCORING_RULES[value.repeat(3)] || 0;
            validDice = validDice.concat(new Array(3).fill(num));
            remainingDice = remainingDice.filter(d => d !== num);
        }
    }

    // Score remaining 1s and 5s
    remainingDice.forEach(die => {
        if (die === 1) {
            score += SCORING_RULES['1'];
            validDice.push(die);
        } else if (die === 5) {
            score += SCORING_RULES['5'];
            validDice.push(die);
        }
    });

    return { validDice, score };
}

process.on('unhandledRejection', error => console.error('Unhandled promise rejection:', error));
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to log in to Discord:', error);
    process.exit(1);
});
