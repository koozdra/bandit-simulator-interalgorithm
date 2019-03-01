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
    head,
    tail,
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

  const cumulativeSum = list => {
    const h = head(list);
    const t = tail(list);
    return t.reduce(
      (acc, x, index) => {
        acc.push(acc[index] + x);
        return acc;
      },
      [h]
    );
  };

  reset();

  const variantExpectedValue = variant =>
    variant.bandit.pulls === 0
      ? 0
      : variant.bandit.rewards / variant.bandit.pulls;

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
    "epsilon-greedy": ({ factor, epsilon, minExploreVisits, variants }) => {
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
    "epsilon-greedy-complement-explore": ({
      factor,
      epsilon,
      minExploreVisits,
      variants
    }) => {
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

        const selectedVariantIndex = indexByRandom(
          complementProbabilities,
          Math.random(),
          0
        );
        return variants[selectedVariantIndex];
      }

      return maxBy(variantExpectedValue)(variants);
    },
    "epsilon-greedy-decay": ({ factor, epsilon, variants }) => {
      const isExplore =
        Math.random() <
        epsilonCalculation["epsilon-greedy-decay"](factor, epsilon, variants);

      if (isExplore) {
        return sample(variants);
      }

      return maxBy(variantExpectedValue)(variants);
    },
    softmax: ({ tau, minExploreVisits, variants }) => {
      const variantExpo = tau => variant => {
        const ev = variantExpectedValue(variant);
        return Math.exp(ev / tau);
      };
      const totalExpectedValues = flow(
        map(variantExpo(tau)),
        sum
      )(variants);

      const variantExpoedList = map(variant => {
        return variantExpo(tau)(variant) / totalExpectedValues;
      })(variants);

      const selectedVariantIndex = indexByRandom(
        variantExpoedList,
        Math.random(),
        0
      );
      return variants[selectedVariantIndex];
    },
    ucb: ({ variants, minExploreVisits }) => {
      const variantsBelowMinVisits = filter(
        variant => variant.bandit.pulls < minExploreVisits
      )(variants);

      if (!isEmpty(variantsBelowMinVisits)) {
        return sample(variantsBelowMinVisits);
      }

      const totalPulls = flow(
        map(getOr(0, "bandit.pulls")),
        sum
      )(variants);

      return flow(
        map(variant => {
          const expectedValue = variantExpectedValue(variant);
          // TODO be careful of pulls being zero
          const boost = Math.sqrt(
            (2 * Math.log(totalPulls)) / variant.bandit.pulls
          );
          return [variant, expectedValue + boost];
        }),
        maxBy(a => a[1]),
        a => a[0]
      )(variants);
    }
  };

  const visit = ({
    epsilon,
    decayFactor,
    type,
    minVisits,
    variants,
    delay,
    step,
    tau
  }) => {
    const selectedVariant = variantSelection[type]({
      factor: decayFactor,
      epsilon,
      minExploreVisits: minVisits,
      variants,
      tau
    });

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
        decayFactor,
        tau
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
          step: i,
          decayFactor,
          tau
        });

        delayedTasks = flow(
          map(processDelayedTask(i)),
          compact
        )(delayedTasks);
      }

      const { chosenVariantIndexes, rewards } = history;

      const dataPoints = 100;

      const cumulativeRewards = flow(
        cumulativeSum,
        chunk(rewards.length / dataPoints),
        map(last)
      )(rewards);

      const bestVariantIndex = flow(
        maxBy("ev"),
        get("index")
      )(banditVariants);

      const cumulativeRegret = flow(
        map(selectedIndex => (selectedIndex !== bestVariantIndex ? 1 : 0)),
        cumulativeSum,
        chunk(chosenVariantIndexes.length / dataPoints),
        map(last)
      )(chosenVariantIndexes);

      let bestVariantUsageCount = 0;
      const bestVariantUsage = chosenVariantIndexes.map(
        (selectedIndex, index) => {
          if (selectedIndex === bestVariantIndex) {
            bestVariantUsageCount += 1;
          }
          return bestVariantUsageCount / (index + 1);
        }
      );

      const bestVariantUsageOutput = flow(
        chunk(chosenVariantIndexes.length / dataPoints),
        map(last)
      )(bestVariantUsage);

      self.postMessage({
        messageType: "runComplete",
        data: [cumulativeRewards, cumulativeRegret, bestVariantUsageOutput],
        index
      });
    }
  });
};
