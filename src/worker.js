/* eslint-disable*/

module.exports = () => {
  self.importScripts(
    "https://cdn.jsdelivr.net/g/lodash@4(lodash.min.js+lodash.fp.min.js)"
  );

  const {
    map,
    last,
    reduce,
    maxBy,
    get,
    filter,
    sum,
    merge,
    isEmpty,
    identity,
    sample,
    compact,
    chunk,
    flow,
    mapValues,
    getOr
  } = _;
  const mapWithIndex = map.convert({ cap: false });

  let history = {};
  let delayedTasks = [];

  const reset = () => {
    history = { chosenVariantIndexes: [], rewards: [] };
    delayedTasks = [];
  };

  reset();

  const variantExpectedValue = variant =>
    variant.bandit.pulls === 0
      ? 0
      : variant.bandit.rewards / variant.bandit.pulls;

  const epsilonCalculation = {
    "epsilon-greedy": (factor, epsilon, variants) => epsilon,
    "epsilon-greedy-complement-explore": (factor, epsilon, variants) => epsilon,
    "epsilon-greedy-decay": (factor, epsilon, variants) => {
      const variantMultiplier = factor;
      const totalRewards = flow(
        map(getOr(0, "bandit.rewards")),
        sum
      )(variants);
      const totalVariants = variants.length;

      return (
        (totalVariants * variantMultiplier) /
        (totalRewards + totalVariants * variantMultiplier)
      );
    }
  };

  const variantSelection = {
    "epsilon-greedy": (factor, epsilon, minExploreVisits, variants) => {
      const variantsBelowMinVisits = filter(
        variant => variant.bandit.pulls < minExploreVisits
      )(variants);

      if (!isEmpty(variantsBelowMinVisits)) {
        return sample(variantsBelowMinVisits);
      }

      const variantsWithRewards = filter(variant =>
        get("bandit.rewards")(variant)
      )(variants);

      const isExplore =
        Math.random() <
        epsilonCalculation["epsilon-greedy"](factor, epsilon, variants);

      if (isExplore || isEmpty(variantsWithRewards)) {
        return sample(variants);
      }

      return maxBy(variantExpectedValue)(variants);
    },
    "epsilon-greedy-complement-explore": (
      factor,
      epsilon,
      minExploreVisits,
      variants
    ) => {
      const variantsBelowMinVisits = filter(
        variant => variant.bandit.pulls < minExploreVisits
      )(variants);

      if (!isEmpty(variantsBelowMinVisits)) {
        return sample(variantsBelowMinVisits);
      }

      const variantsWithRewards = filter(variant =>
        get("bandit.rewards")(variant)
      )(variants);

      const isExplore =
        Math.random() <
        epsilonCalculation["epsilon-greedy"](factor, epsilon, variants);

      if (isExplore || isEmpty(variantsWithRewards)) {
        const totalPulls = flow(
          map(getOr(0, "bandit.pulls")),
          sum
        )(variants);
        const complements = map(
          flow(
            getOr(0, "bandit.pulls"),
            a => totalPulls - a
          )
        )(variants);

        const complementTotal = sum(complements);

        const complementProbabilities = map(a => a / complementTotal)(
          complements
        );

        // console.log(
        //   "karen",
        //   variants,
        //   totalPulls,
        //   complements,
        //   complementTotal,
        //   complementProbabilities,
        //   sum(complementProbabilities)
        // );

        // data: an array of floats where sum(float) =ish 1
        // r: a unit random [0,1), eroded with each recursive call
        // index: current index being searched
        const indexByRandom = (data, r, index) => {
          const val = data[index];

          if (r - val <= 0) {
            return index;
          }

          return indexByRandom(data, r - val, index + 1);
        };

        const selectedVariantIndex = indexByRandom(
          complementProbabilities,
          Math.random(),
          0
        );
        return variants[selectedVariantIndex];
      }

      return maxBy(variantExpectedValue)(variants);
    },
    "epsilon-greedy-decay": (factor, epsilon, minExploreVisits, variants) => {
      const isExplore =
        Math.random() <
        epsilonCalculation["epsilon-greedy-decay"](factor, epsilon, variants);

      if (isExplore) {
        return sample(variants);
      }

      return maxBy(variantExpectedValue)(variants);
    }
  };

  const visit = ({
    epsilon,
    decayFactor,
    type,
    minVisits,
    variants,
    delay,
    step
  }) => {
    const selectedVariant = variantSelection[type](
      decayFactor,
      epsilon,
      minVisits,
      variants
    );

    const { index, ev, reward = 1 } = selectedVariant;
    history.chosenVariantIndexes.push(index);

    selectedVariant.bandit.pulls += reward;

    if (Math.random() <= ev) {
      const thunk = () => {
        selectedVariant.bandit.rewards += reward;
        history.rewards.push(1);
      };
      delayedTasks.push({ step: step + delay, thunk });
    } else {
      history.rewards.push(0);
    }
  };

  self.addEventListener("message", event => {
    // console.log("in worker data", event.data);
    const {
      messageType,
      data: {
        iterations = 1000,
        minVisits = 10,
        variants = [
          { ev: 0.2, variantName: "v1" },
          { ev: 0.4, variantName: "v2" },
          { ev: 0.6, variantName: "v3" },
          { ev: 0.8, variantName: "v4" }
        ],
        epsilon = 0.1,
        delay = 10,
        type,
        decayFactor
      },
      index
    } = event.data;

    if (messageType === "start") {
      reset();

      const banditVariants = mapWithIndex((variant, index) =>
        merge(
          {
            index,
            bandit: {
              pulls: 0,
              rewards: 0
            }
          },
          mapValues(parseFloat)(variant)
        )
      )(variants);

      const processDelayedTask = i => delayedTask => {
        const { step, thunk } = delayedTask;
        if (i < step && step < iterations) {
          return delayedTask;
        }
        thunk();
        return undefined;
      };

      for (let i = 0; i < iterations; i++) {
        visit({
          epsilon: parseFloat(epsilon),
          type,
          minVisits,
          variants: banditVariants,
          delay,
          index: i,
          decayFactor
        });

        delayedTasks = flow(
          map(processDelayedTask(i)),
          compact
        )(delayedTasks);
      }

      const { chosenVariantIndexes, rewards } = history;

      const dataPoints = 100;

      const cumulativeRewards = flow(
        reduce((r, a) => (r.push(a + (last(r) || 0)), r), []),
        chunk(rewards.length / dataPoints),
        map(last)
      )(rewards);

      const bestVariantIndex = flow(
        maxBy("ev"),
        get("index")
      )(banditVariants);

      const cumulativeRegret = flow(
        map(selectedIndex => (selectedIndex !== bestVariantIndex ? 1 : 0)),
        reduce((r, a) => (r.push(a + (last(r) || 0)), r), []),
        chunk(chosenVariantIndexes.length / dataPoints),
        map(last)
      )(chosenVariantIndexes);

      // console.log(bestVariantIndex, chosenVariantIndexes);

      self.postMessage({
        messageType: "runComplete",
        data: [cumulativeRewards, cumulativeRegret],
        index
      });
    }
  });
};
