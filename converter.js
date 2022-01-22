/**
 * converts games.json to PokerStars HandHistory
 */
const fs = require('fs');
const fsPromises = require('fs').promises;
const dayjs = require('dayjs');

async function readGames() {
  let inputData = '';
  try {
    inputData = await fsPromises.readFile('games.json', 'utf8');
  } catch (e) {
    console.error('Cannot read in input.txt', e);
  }

  return JSON.parse(inputData);
}

function parseCurrency(currency) {
  return ({
    BCH: '',
    BTC: '€'
  }[currency]);
}

const suitMap = {
  'DIAMONDS': 'd',
  'HEARTS': 'h',
  'SPADES': 's',
  'CLUBS': 'c'
}

function getCardString({ rank, suit }) {
  return `${rank}${suitMap[suit]}`
}

function getHandTitle(key, currency, blinds, rounds) {
  // Winamax Poker - CashGame - HandId: #16721916-72-1638967155 - Holdem no limit (5€/10€) - 2021/12/08 12:39:15 UTC
  const handNumber = key;
  const limits = `${blinds.small}${currency}/${blinds.big}${currency}`
  const timestamp = dayjs(rounds[0].time).format('YYYY/MM/DD HH:mm:ss UTC');

  return `Winamax Poker - CashGame - HandId: #${handNumber} - Holdem no limit (${limits}) - ${timestamp}\n`
}

function getTableTitle(name, numSeats, seats) {
  // Table: 'Bradford' 5-max (real money) Seat #5 is the button
  const getButton = (seats) => seats.find(s => !!s.isDealer).index;
  const tableName = `${name}`
  const maxLabel = `${numSeats}-max`
  const buttonLabel = `Seat #${getButton(seats)} is the button`

  return `Table: '${tableName}' ${maxLabel} (real money) ${buttonLabel}\n`
}

function getSeatsList(seats, currency) {
  /*
    Seat 1: Incognito 1 (1887€)
    Seat 2: Folderin (1000€)
    Seat 3: Incognito 3 (1000€)
    Seat 4: Incognito 4 (1000€)
    Seat 5: Incognito 5 (383.82€)
  * */
  const parsedSeats = seats.map((seat) =>
    `Seat ${seat.index}: ${seat.name} (${seat.stack + seat.potContributions + seat.rakeTaken}${currency})`
  )
  return `${parsedSeats.join('\n')}\n`;
}

function getBlindsRound(seats, blinds, currency, gameState) {
  /*
    *** ANTE/BLINDS ***
    Incognito 1 posts small blind 5€
    Folderin posts big blind 10€
   */

  const headerLabel = '*** ANTE/BLINDS ***';
  const smallBlindSeat = seats.find(s => !!s.isSmallBlind);
  const bigBlindSeat = seats.find(s => !!s.isBigBlind);

  const smallBlindRound = smallBlindSeat ? `${smallBlindSeat.name}: posts small blind ${blinds.small}${currency}\n`: '';
  const bigBlindRound = bigBlindSeat ? `${bigBlindSeat.name}: posts big blind ${blinds.big}${currency}\n` : '';

  gameState.currentTopBet = blinds.big;

  return `${headerLabel}\n${smallBlindRound}${bigBlindRound}`
}

function getSummary(seats, rakeTaken, currency, rounds) {
  /*
    *** SUMMARY ***
    Total pot 15€ | No rake
    Seat 5: Incognito 5 (big blind) won 15€

   */

  /*
    *** SUMMARY ***
    Total pot 52€ | Rake 3€
    Board: [7d 6h Kd 4d Kh]
    Seat 1: Incognito 1 (big blind) showed [Ac Td] and won 26€ with One pair : Kings
    Seat 2: Folderin showed [Ts Ah] and won 26€ with One pair : Kings

   */

  const getPositionLabel = (seat) => {
    if (seat.isBigBlind) {
      return ' (big blind) ';
    }
    if (seat.isSmallBlind) {
      return ' (small blind) ';
    }
    if (seat.isDealer) {
      return ' (button) ';
    }
    return ''
  }

  const getShowedLabel = (seat) => {
    if (seat.mucked) {
      return '';
    }

    const holeCards = seat.cards.filter(c => c.holeCard).map(getCardString).join(' ');
    return ` showed [${holeCards}] and `;
  }

  const getAction = (seat, currency) => {
    const { winnings } = seat;

    if (!winnings) {
      return '';
    }

    if (winnings > 0) {
      return `won ${winnings}${currency}`
    }

    //TODO: other summaries...

    return '';
  }

  const getBoard = (rounds) => {
    const flopCardsString = getRoundCardsString(rounds, 'FLOP');
    const turnCardString = getRoundCardsString(rounds, 'TURN');
    const riverCardString = getRoundCardsString(rounds, 'RIVER');
    if (!flopCardsString && !turnCardString && !riverCardString) {
      return ''
    }
    let allCardsString = flopCardsString;
    if (turnCardString) allCardsString = `${allCardsString} ${turnCardString}`;
    if (riverCardString) allCardsString = `${allCardsString} ${riverCardString}`;
    return `Board: [${allCardsString}]\n`
  }

  const SUMMARY = '*** SUMMARY ***';
  const potContributions = seats.reduce((total, current) => total + current.potContributions, 0);
  const rakeLabel = rakeTaken > 0 ? `Rake ${rakeTaken}` : 'No Rake';
  const total = `Total pot ${potContributions} | ${rakeLabel}`
  const board = getBoard(rounds);
  const seatsResultArray = seats.filter(seat => seat.winnings).map(((seat) => {
    return `Seat ${seat.index}: ${seat.name}${getPositionLabel(seat)}${getShowedLabel(seat)}${getAction(seat,
      currency)}`
  }));
  return `${SUMMARY}\n${total}\n${board}${seatsResultArray.join('\n')}\n`;
}

const ACTION_TYPES = {
  POST_BLIND: 'POST_BLIND',
  RAISE: 'RAISE',
  FOLD: 'FOLD',
  CALL: 'CALL',
  CHECK: 'CHECK'
}

function parseActions(actions, accountByIndex, currency, gameState) {
  return actions
    .map(a => {
      const { index, type, amount } = a;
      const actionHolder = accountByIndex[index];
      switch (type) {
        case ACTION_TYPES.FOLD:
          return `${actionHolder} folds`
        case ACTION_TYPES.CALL:
          return `${actionHolder} calls ${amount}${currency}`
        case ACTION_TYPES.RAISE: {
          const previousTopBet = gameState.currentTopBet;
          let actionLabel = '';
          if (previousTopBet === 0) {
            actionLabel = `${actionHolder} bets ${amount}${currency}`
          } else {
            actionLabel = `${actionHolder} raises ${amount - previousTopBet}${currency} to ${amount}${currency}`
          }
          gameState.currentTopBet = amount;
          return actionLabel;
        }
        case ACTION_TYPES.CHECK:
          return `${actionHolder} checks`
        default:
          return '';
      }
    }).filter(each => !!each); // remove empty strings
}

function getRoundCardsString(rounds, type) {
  const round = rounds.find(({ round }) => round === type);
  if (round && round.community) {
    return `${round.community.map(getCardString).join(' ')}`;
  }
  return ''
}

function somethingHappensInRound(actions, rounds, roundType) {
  return (actions && actions.length > 0) || rounds.some(({ round }) => round === roundType)
}

function getActionLabels(actions, accountByIndex, currency, gameState) {
  const actionLabels = parseActions(actions, accountByIndex, currency, gameState);
  if (actionLabels.length === 0) {
    return '';
  }
  return `\n${actionLabels.join('\n')}`
}

function getPreflopRound(actions, accountByIndex, currency, gameState) {
  if (!actions || actions.length === 0) {
    return '';
  }
  const headerLabel = '*** PRE-FLOP ***';
  return `${headerLabel}${getActionLabels(actions, accountByIndex, currency, gameState)}\n`
}

function getFlopRound(actions, rounds, accountByIndex, currency, gameState) {
  if (!somethingHappensInRound(actions, rounds, 'FLOP')) {
    return '';
  }

  const headerLabel = `*** FLOP *** [${getRoundCardsString(rounds, 'FLOP')}]`;
  return `${headerLabel}${getActionLabels(actions, accountByIndex, currency, gameState)}\n`
}

function getTurnRound(actions, rounds, accountByIndex, currency, gameState) {
  if (!somethingHappensInRound(actions, rounds, 'TURN')) {
    return '';
  }
  const headerLabel = `*** TURN *** [${getRoundCardsString(rounds, 'FLOP')}][${getRoundCardsString(rounds, 'TURN')}]`;
  return `${headerLabel}${getActionLabels(actions, accountByIndex, currency, gameState)}\n`
}

function getRiverRound(actions, rounds, accountByIndex, currency, gameState) {
  if (!somethingHappensInRound(actions, rounds, 'RIVER')) {
    return '';
  }
  const headerLabel = `*** RIVER *** [${getRoundCardsString(rounds, 'FLOP')} ${getRoundCardsString(rounds,
    'TURN')}][${getRoundCardsString(rounds, 'RIVER')}]`;
  return `${headerLabel}${getActionLabels(actions, accountByIndex, currency, gameState)}\n`
}

function getRounds(seats, rounds, currency, gameState) {

  const accountByIndex = seats.reduce((all, curr) => ({ ...all, [curr.index]: curr.name }), {});
  const allActionsSorted = seats.reduce((all, currentSeat) => {
    const actions = currentSeat.actions.reduce((allOfSeat, action) => {
      // blind bettings are done already in previous step, so they are ignored here
      if (action.type === ACTION_TYPES.POST_BLIND) {
        return allOfSeat;
      }
      return [
        ...allOfSeat,
        {
          ...action,
          index: currentSeat.index,
          account: currentSeat.account,
          name: currentSeat.name,
          dayjsTime: dayjs(action.time)
        }
      ]
    }, []);
    return all.concat(actions)
  }, []).sort((a, b) => {

    if (a.dayjsTime.isBefore(b.dayjsTime)) {
      return -1;
    }
    if (a.dayjsTime.isAfter(b.dayjsTime)) {
      return 1;
    }
    return b.index - a.index;
  });


  const ROUNDS = {
    PREFLOP: 'PREFLOP',
    FLOP: 'FLOP',
    TURN: 'TURN',
    RIVER: 'RIVER'
  }
  // get round time

  const roundTimes = rounds.reduce((all, current) => {
    return {
      ...all,
      [current.round]: dayjs(current.time)
    }
  }, {
    [ROUNDS.PREFLOP]: null,
    [ROUNDS.FLOP]: null,
    [ROUNDS.TURN]: null,
    [ROUNDS.RIVER]: null,
  });


  const actionsPerRound = allActionsSorted.reduce((result, action) => {
    if (!roundTimes[ROUNDS.FLOP] || action.dayjsTime.isBefore(roundTimes[ROUNDS.FLOP])) {
      result[ROUNDS.PREFLOP].push(action);
    } else if (!roundTimes[ROUNDS.TURN] || action.dayjsTime.isBefore(roundTimes[ROUNDS.TURN])) {
      result[ROUNDS.FLOP].push(action);
    } else if (!roundTimes[ROUNDS.RIVER] || action.dayjsTime.isBefore(roundTimes[ROUNDS.RIVER])) {
      result[ROUNDS.TURN].push(action);
    } else {
      result[ROUNDS.RIVER].push(action);
    }
    return result;
  }, {
    [ROUNDS.PREFLOP]: [],
    [ROUNDS.FLOP]: [],
    [ROUNDS.TURN]: [],
    [ROUNDS.RIVER]: [],
  });

  const preflopRound = getPreflopRound(actionsPerRound[ROUNDS.PREFLOP], accountByIndex, currency, gameState);
  gameState.currentTopBet = 0;
  const flopRound = getFlopRound(actionsPerRound[ROUNDS.FLOP], rounds, accountByIndex, currency, gameState);
  gameState.currentTopBet = 0;
  const turnRound = getTurnRound(actionsPerRound[ROUNDS.TURN], rounds, accountByIndex, currency, gameState);
  gameState.currentTopBet = 0;
  const riverRound = getRiverRound(actionsPerRound[ROUNDS.RIVER], rounds, accountByIndex, currency, gameState);
  gameState.currentTopBet = 0;

  return `${preflopRound}${flopRound}${turnRound}${riverRound}`;

}

function getGameText(game) {
  const gameState = {
    currentTopBet: 0
  }
  const { seats, currency: rawCurrency, key, blinds, rounds, numSeats, rakeTaken, name } = game;
  if(!rounds  || !seats || !rounds) {
    console.error('cannot find data for ', game);
    return ''
  }
  const currency = parseCurrency(rawCurrency);
  const handTitle = getHandTitle(key, currency, blinds, rounds);
  const tableTitle = getTableTitle(name, numSeats, seats);
  const seatsList = getSeatsList(seats, currency);
  const blindsRound = getBlindsRound(seats, blinds, currency, gameState);
  const gameRounds = getRounds(seats, rounds, currency, gameState);

  const summary = getSummary(seats, rakeTaken, currency, rounds);
  return handTitle + tableTitle + seatsList + blindsRound + gameRounds + summary;
}

async function convert() {
  const games = await readGames();

  const gameKeys = Object.keys(games);

  const convertedGames = gameKeys.map(key => getGameText(games[key]));

  const output = convertedGames.join('\n');
  console.log('output', output);

  fs.writeFileSync('output.txt', output, { flag: 'w' });
}

async function convertGames(games) {
  const gameKeys = Object.keys(games);

  try {
    const convertedGames = gameKeys.map(key => getGameText(games[key]));

    return convertedGames.join('\n');
  } catch (e) {
    console.error('Error while converting games', e)
    return "Error while converting games";
  }
}

exports.convert = convertGames;
// convert();
