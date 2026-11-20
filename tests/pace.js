// Evaluate in the game page. All three opponents get the same two possible
// rolls per turn, even when one of them decides to keep the first roll.
({ firstSeed, count }) => {
  const levels = ['Easy', 'Medium', 'Hard'];
  const totals = [0, 0, 0];
  const paired = { hardFaster: 0, mediumFaster: 0, tied: 0 };
  for (let match = 0; match < count; match++) {
    let state = (firstSeed + match) >>> 0;
    const nextDie = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let z = Math.imul(state ^ (state >>> 15), 1 | state);
      z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
      return 1 + Math.floor(((z ^ (z >>> 14)) >>> 0) * 6 / 2 ** 32);
    };
    const positions = [0, 0, 0], tokens = [2, 2, 2], turns = [0, 0, 0];
    while (positions.some(p => p !== 100)) {
      const first = nextDie(), second = nextDie();
      for (const [i, level] of levels.entries()) {
        if (positions[i] === 100) continue;
        if (++turns[i] > 3000) throw Error('Unfinished ' + level + ' game, seed ' + (firstSeed + match));
        const spend = retry(level, positions[i], first, tokens[i]);
        if (spend && (!tokens[i] || landing(positions[i], first) === 100)) throw Error('Invalid reroll');
        if (spend) tokens[i]--;
        positions[i] = landing(positions[i], spend ? second : first);
      }
    }
    turns.forEach((n, i) => { totals[i] += n; });
    if (turns[2] < turns[1]) paired.hardFaster++;
    else if (turns[1] < turns[2]) paired.mediumFaster++;
    else paired.tied++;
  }
  return { count, mean: Object.fromEntries(levels.map((level, i) => [level, totals[i] / count])), paired };
}
