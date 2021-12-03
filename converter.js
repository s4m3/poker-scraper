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

/*
*** HOLE CARDS ***
Dealt to 550469939489210 [8s 3s]
A5_T25045659_R1447: folds
550469939489210: folds
Uncalled bet ($2.50) returned to A4_T25045659_R1066
A4_T25045659_R1066 collected $5 from pot
*** SUMMARY ***
Total pot $5 | Rake $0
Seat 4: A4_T25045659_R1066 (big blind) collected ($5)
Seat 5: A5_T25045659_R1447 (button) folded before Flop (didn't bet)
Seat 9: 550469939489210 (small blind) folded before Flop

* */

function getHandTitle(game) {
  // PokerStars Hand #4175113892: Hold'em No Limit ($2.50/$5 USD) - 2021/09/22 13:53:16 UTC
  const { key, currency, blinds, rounds } = game;
  const handNumber = key;
  const limits = `${blinds.small}/${blinds.big} ${currency}`
  const timestamp = dayjs(rounds[0].time).format('YYYY/MM/DD HH:mm:ss UTC');

  return `PokerStars Hand #${handNumber}: Hold'em No Limit (${limits}) - ${timestamp}\n`
}

function getTableTitle(game) {
  // Table 'IGNC_$2.50/$5 No Limit Hold'em - 25045659' 9-max Seat #5 is the button

  const getButton = (seats) => seats.find(s => !!s.isDealer).index;
  const { blinds, name, table, numSeats, seats } = game;
  const tableName = `${name}`
  const tableRound = `${table}`
  const seatsLabel = `${numSeats}-max Seat`
  const limits = `${blinds.small}/${blinds.big}`
  const buttonLabel = `#${getButton(seats)} is the button`

  return `Table '${tableName}_${limits} No Limit Hold'em - ${tableRound}' ${seatsLabel} ${buttonLabel}\n`
}

function getSeatsList(seats) {
  const parsedSeats = seats.map((seat) => `Seat ${seat.index}: ${seat.account} (${seat.stack} in chips)`)
  return `${parsedSeats.join('\n')}\n`;
}

function getBlindsRound(seats, blinds) {
  // 550469939489210: posts small blind $2.50
  // A4_T25045659_R1066: posts big blind $5

  const smallBlindSeat = seats.find(s => !!s.isSmallBlind);
  const bigBlindSeat = seats.find(s => !!s.isBigBlind);

  const smallBlindRound = `${smallBlindSeat.account}: posts small blind ${blinds.small}`;
  const bigBlindRound = `${bigBlindSeat.account}: posts big blind ${blinds.big}`;

  return `${smallBlindRound}\n${bigBlindRound}\n`
}

function getPreflopRound(game) {
  return '\n'
}

function getSummary(game) {
  // console.log(game);
  //Total pot $10 | Rake $0
  // Seat 1: A1_T25045659_R8277 folded before Flop (didn't bet)
  // Seat 2: A2_T25045659_R8091 folded before Flop (didn't bet)
  // Seat 3: A3_T25045659_R3606 (button) folded before Flop
  // Seat 4: A4_T25045659_R1818 (small blind) folded before Flop
  // Seat 6: A6_T25045659_R3444 (big blind) folded before Flop
  // Seat 7: A7_T25045659_R4326 collected ($15)
  // Seat 8: A8_T25045659_R9474 folded before Flop (didn't bet)
  // Seat 9: 550469939489210 folded before Flop (didn't bet)

  /*
    Total pot $112.50 | Rake $16
    Board [9h 3h Ac 4h 4s]
    Seat 1: A1_T25045659_R8277 (small blind) folded before Flop
    Seat 2: A2_T25045659_R9537 (big blind) folded before Flop
    Seat 3: A3_T25045659_R2161 folded before Flop (didn't bet)
    Seat 4: A4_T25045659_R1818 showed [7s 7h] and lost with two pair, Sevens and Fours
    Seat 5: A5_T25045659_R2465 folded before Flop (didn't bet)
    Seat 6: A6_T25045659_R5094 folded before Flop (didn't bet)
    Seat 7: A7_T25045659_R4326 showed [Kc Kd] and won ($96.50) with two pair, Kings and Fours
    Seat 8: A8_T25045659_R9474 (button) folded before Flop (didn't bet)

   */

  const getPositionLabel = (seat) => {
    if (seat.isBigBlind) {
      return '(big blind) ';
    }
    if (seat.isSmallBlind) {
      return '(small blind) ';
    }
    if (seat.isDealer) {
      return '(button) ';
    }
    return ''
  }

  const getAction = (seat) => {
    const { isFolded, actions, mucked, winnings, potContributions } = seat;
    if (isFolded) {
      const didBet = actions.some(action => action.amount > 0);
      const didntBetLabel = didBet ? '' : ' (didn\'t bet)'
      return `folded before Flop${didntBetLabel}`
    }

    if (winnings > 0) {
      if (mucked) {
        return `collected ${winnings} from pot`
      }
    }

    //TODO: other summaries...

    return '';
  }

  const potContributions = game.seats.reduce((total, current) => total + current.potContributions, 0);
  const total = `Total pot ${potContributions} | Rake ${game.rakeTaken}\n`
  const seatsResultArray = game.seats.map(((seat) => {
    return `Seat ${seat.index}: ${seat.account} ${getPositionLabel(seat)}${getAction(seat)}`
  }));
  return `${total}${seatsResultArray.join('\n')}\n`;
}

const ACTION_TYPES = {
  POST_BLIND: 'POST_BLIND',
  RAISE: 'RAISE',
  FOLD: 'FOLD',
  CALL: 'CALL',
  CHECK: 'CHECK'
}

function getRounds(game) {
  const { seats, rounds } = game;
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

  console.log('allActionsSorted', allActionsSorted);

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

  console.log('actionsPerRound', actionsPerRound);

  // group actions by rounds

}

function getGameText(game) {
  const handTitle = getHandTitle(game);
  const tableTitle = getTableTitle(game);
  const seatsList = getSeatsList(game.seats);
  const blindsRound = getBlindsRound(game.seats, game.blinds);
  const HOLE_CARDS = '*** HOLE CARDS ***\n';

  const rounds = getRounds(game);

  //...
  const SUMMARY = '*** SUMMARY ***\n';
  const summary = getSummary(game);
  const result = handTitle + tableTitle + seatsList + blindsRound + HOLE_CARDS + SUMMARY + summary;
  return result;
}

async function convert() {
  const games = await readGames();

  const gameKeys = Object.keys(games);

  const convertedGames = gameKeys.map(key => getGameText(games[key]));

  const output = convertedGames.join('\n');
  console.log('output', output);

  fs.writeFileSync('output.txt', output, { flag: 'w' });
}

convert();
