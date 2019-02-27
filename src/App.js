import React, { Component } from "react";
import Chart from "react-c3-component";
import "c3/c3.css";
import { Button, Form, FormGroup, Collapse } from "reactstrap";

const blob = new Blob(["(" + require("./worker.js") + ")()"]);
const {
  bindAll,
  map,
  keys,
  set,
  flow,
  range,
  reduce,
  includes,
  zipAll,
  sum,
  get,
  pullAt
} = require("lodash/fp");
const mapWithIndex = require("lodash/fp/map").convert({ cap: false });

function simulate(candidates, pullsPerSimulation) {
  let outstandingSimulations = candidates.length;
  let output = {
    cumulativeRegret: [],
    cumulativeReward: []
  };

  return new Promise(resolve => {
    mapWithIndex((candidate, index) => {
      const worker = new Worker(URL.createObjectURL(blob));

      worker.postMessage({
        messageType: "start",
        data: { ...candidate, iterations: pullsPerSimulation },
        index
      });

      worker.addEventListener("message", event => {
        const { data, index: indexFromWorker } = event.data;

        const [cumulativeReward, cumulativeRegret] = data;

        outstandingSimulations -= 1;
        output = flow(
          set(`cumulativeReward.${indexFromWorker}`, cumulativeReward),
          set(`cumulativeRegret.${indexFromWorker}`, cumulativeRegret)
        )(output);

        if (outstandingSimulations === 0) {
          resolve(output);
        }
      });
    })(candidates);
  });
}

function CandidateAlgorithm(props) {
  const {
    index,
    stateChange,
    addVariant,
    replicateVariants,
    candidate,
    removeAlgorithm,
    removeVariant
  } = props;
  const algorithms = {
    "epsilon-greedy": "Epsilon Greedy",
    "epsilon-greedy-complement-explore":
      "Epsilon Greedy with Complement Explore",
    "epsilon-greedy-decay": "Epsilon Greedy Decay",
    softmax: "Softmax"
  };
  const algorithmTypes = keys(algorithms);
  const { variants = [] } = candidate;

  return (
    <div
      style={{
        padding: "10px",
        border: "1px solid #AAAAAA",
        marginBottom: 10,
        borderRadius: 5
      }}
    >
      <div style={{ float: "right" }}>
        <Button outline color="danger" onClick={() => removeAlgorithm(index)}>
          Delete
        </Button>
        <h1 style={{ color: "#666666", textAlign: "right" }}>{index + 1}</h1>
      </div>
      <FormGroup>
        Type:
        {map(algorithmType => {
          return (
            <FormGroup check>
              <label>
                <input
                  type="radio"
                  name={`radio-input-group-${index}`}
                  onChange={() => {
                    stateChange(`candidates.${index}.type`, algorithmType);
                  }}
                  checked={algorithmType === candidate.type}
                />{" "}
                {algorithms[algorithmType]}
              </label>
            </FormGroup>
          );
        })(algorithmTypes)}
      </FormGroup>

      <FormGroup style={{ display: "inline-block", marginRight: "10px" }}>
        <label>
          Min Visits:{" "}
          <input
            type="number"
            min="1"
            max="100"
            value={candidate.minVisits}
            onChange={({ target: { value } }) =>
              stateChange(`candidates.${index}.minVisits`, value)
            }
          />
        </label>
      </FormGroup>
      <FormGroup style={{ display: "inline-block", marginRight: "10px" }}>
        <label>
          Delay:{" "}
          <input
            type="number"
            min="0"
            max="1000"
            step="10"
            value={candidate.delay}
            onChange={({ target: { value } }) =>
              stateChange(`candidates.${index}.delay`, value)
            }
          />
        </label>
      </FormGroup>
      {includes(candidate.type)([
        "epsilon-greedy-complement-explore",
        "epsilon-greedy"
      ]) && (
        <FormGroup style={{ display: "inline-block", marginRight: "10px" }}>
          <label>
            Epsilon:{" "}
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={candidate.epsilon}
              onChange={({ target: { value } }) =>
                stateChange(`candidates.${index}.epsilon`, value)
              }
            />
          </label>
        </FormGroup>
      )}
      {candidate.type === "epsilon-greedy-decay" && (
        <FormGroup style={{ display: "inline-block", marginRight: "10px" }}>
          {" "}
          <label>
            Decay Factor:{" "}
            <input
              type="number"
              step="1"
              min="1"
              max="1000"
              value={candidate.decayFactor}
              onChange={({ target: { value } }) =>
                stateChange(`candidates.${index}.decayFactor`, value)
              }
            />
          </label>
        </FormGroup>
      )}
      {candidate.type === "softmax" && (
        <FormGroup style={{ display: "inline-block", marginRight: "10px" }}>
          {" "}
          <label>
            Temperature:{" "}
            <input
              type="number"
              step="1"
              min="1"
              max="1000"
              value={candidate.tau}
              onChange={({ target: { value } }) =>
                stateChange(`candidates.${index}.tau`, value)
              }
            />
          </label>
        </FormGroup>
      )}
      <FormGroup>
        <div>Variants:</div>
        <div style={{ paddingLeft: "10px" }}>
          {variants.length === 0 && (
            <div>
              <i>no variants present</i>
            </div>
          )}
          {mapWithIndex((variant, variantIndex) => (
            <div key={variantIndex}>
              <FormGroup style={{ display: "inline-block", marginBottom: 0 }}>
                <label>
                  ev:{" "}
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    onChange={({ target: { value } }) => {
                      stateChange(
                        `candidates.${index}.variants.${variantIndex}.ev`,
                        value
                      );
                    }}
                    value={variant.ev}
                  />
                </label>
              </FormGroup>{" "}
              <FormGroup style={{ display: "inline-block", marginBottom: 0 }}>
                <label>
                  r:{" "}
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="1"
                    onChange={({ target: { value } }) => {
                      stateChange(
                        `candidates.${index}.variants.${variantIndex}.r`,
                        value
                      );
                    }}
                    value={variant.r}
                  />
                </label>
              </FormGroup>{" "}
              <Button
                outline
                size="sm"
                color="danger"
                onClick={() => removeVariant(index, variantIndex)}
              >
                Delete
              </Button>
            </div>
          ))(variants)}
          <Button color="primary" onClick={() => addVariant(index)}>
            Add Variant
          </Button>{" "}
          <Button
            outline
            color="secondary"
            onClick={() => replicateVariants(index)}
          >
            Replicate Variants in All Tests
          </Button>
        </div>
      </FormGroup>
    </div>
  );
}

const adderCandidate = {
  minVisits: 10,
  delay: 50,
  decayFactor: 7,
  epsilon: 0.1,
  tau: 0.1,
  type: "epsilon-greedy",
  iterations: 1000,
  variants: [
    { ev: 0.1, r: 1 },
    { ev: 0.3, r: 1 },
    { ev: 0.7, r: 1 },
    { ev: 0.9, r: 1 }
  ]
};

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      candidates: [adderCandidate],
      numSimulations: 10,
      pullsPerSimulation: 1000,
      isOpenBookmarks: false
    };

    bindAll(["addCandidate", "stateChange"])(this);
  }

  stateChange(path, value) {
    this.setState(oldState => set(path, value)(oldState));
  }

  addCandidate() {
    this.setState(oldState => ({
      candidates: [...oldState.candidates, adderCandidate]
    }));
  }

  render() {
    const {
      candidates,
      outstandingSimulations,
      chartDataCumulativeRegret,
      chartDataCumulativeReward,
      numSimulations,
      pullsPerSimulation,
      isOpenBookmarks
    } = this.state;

    return (
      <div className="App">
        <Button
          onClick={() => this.setState({ isOpenBookmarks: !isOpenBookmarks })}
        >
          Bookmarks
        </Button>
        <Collapse isOpen={isOpenBookmarks}>
          Bookmarks:{" "}
          <div style={{ paddingLeft: 10 }}>
            <a
              href="#"
              onClick={() => {
                const template = {
                  variants: [
                    { ev: 0.1, r: 1 },
                    { ev: 0.3, r: 1 },
                    { ev: 0.7, r: 1 },
                    { ev: 0.9, r: 1 }
                  ],
                  minVisits: "10",
                  delay: "10"
                };
                const candidates = [
                  { type: "epsilon-greedy", epsilon: "0.1", ...template },
                  { type: "epsilon-greedy", epsilon: "0.3", ...template },
                  { type: "epsilon-greedy", epsilon: "0.7", ...template },
                  { type: "epsilon-greedy", epsilon: "1", ...template }
                ];
                this.setState({ candidates });
              }}
            >
              Different values for epsilon (four variants)
            </a>
            <br />
            <a
              href="#"
              onClick={() => {
                const template = {
                  variants: [
                    { ev: 0.1, r: 1 },
                    { ev: 0.2, r: 1 },
                    { ev: 0.3, r: 1 },
                    { ev: 0.4, r: 1 },
                    { ev: 0.5, r: 1 },
                    { ev: 0.6, r: 1 },
                    { ev: 0.7, r: 1 },
                    { ev: 0.9, r: 1 }
                  ],
                  minVisits: "10",
                  delay: "10"
                };
                const candidates = [
                  { type: "epsilon-greedy", epsilon: "0.1", ...template },
                  {
                    type: "epsilon-greedy-decay",
                    decayFactor: "7",
                    ...template
                  }
                ];
                this.setState({ candidates });
              }}
            >
              Epsilon greedy vs decay (nine variants)
            </a>
            <br />
            <a
              href="#"
              onClick={() => {
                const template = {
                  variants: [
                    { ev: 0.3, r: 1 },
                    { ev: 0.4, r: 1 },
                    { ev: 0.5, r: 1 },
                    { ev: 0.6, r: 1 }
                  ],
                  minVisits: "10",
                  delay: "10"
                };
                const candidates = [
                  {
                    type: "epsilon-greedy-decay",
                    decayFactor: "1",
                    ...template
                  },
                  {
                    type: "epsilon-greedy-decay",
                    decayFactor: "4",
                    ...template
                  },
                  {
                    type: "epsilon-greedy-decay",
                    decayFactor: "7",
                    ...template
                  },
                  {
                    type: "epsilon-greedy-decay",
                    decayFactor: "15",
                    ...template
                  }
                ];
                this.setState({ candidates });
              }}
            >
              Epsilon greedy decay with different decay factors
            </a>
            <br />
            <a
              href="#"
              onClick={() => {
                const template = {
                  variants: [
                    { ev: 0.3, r: 1 },
                    { ev: 0.4, r: 1 },
                    { ev: 0.7, r: 1 },
                    { ev: 0.9, r: 1 }
                  ],
                  minVisits: "10"
                };
                const candidates = [
                  {
                    type: "epsilon-greedy",
                    epsilon: "0.1",
                    delay: 10,
                    ...template
                  },
                  {
                    type: "epsilon-greedy",
                    epsilon: "0.1",
                    delay: 50,
                    ...template
                  },
                  {
                    type: "epsilon-greedy",
                    epsilon: "0.1",
                    delay: 100,
                    ...template
                  },
                  {
                    type: "epsilon-greedy",
                    epsilon: "0.1",
                    delay: 300,
                    ...template
                  }
                ];
                this.setState({ candidates });
              }}
            >
              Epsilon greedy with different delays
            </a>
            <br />
            <a
              href="#"
              onClick={() => {
                const template = {
                  variants: [
                    { ev: 0.3, r: 1 },
                    { ev: 0.4, r: 1 },
                    { ev: 0.7, r: 1 },
                    { ev: 0.9, r: 1 }
                  ],
                  minVisits: "10"
                };
                const candidates = [
                  {
                    type: "epsilon-greedy",
                    epsilon: "0.1",
                    delay: 10,
                    ...template
                  },
                  {
                    type: "epsilon-greedy-complement-explore",
                    epsilon: "0.1",
                    delay: 10,
                    ...template
                  }
                ];
                this.setState({ candidates });
              }}
            >
              Epsilon greedy vs epsilon greedy with complement explore
            </a>
            <br />
            <a
              href="#"
              onClick={() => {
                const template = {
                  variants: [
                    { ev: 0.3, r: 1 },
                    { ev: 0.4, r: 1 },
                    { ev: 0.7, r: 1 },
                    { ev: 0.9, r: 1 }
                  ],
                  minVisits: "10",
                  epsilon: "0.1",
                  delay: 10
                };
                const candidates = [
                  {
                    type: "softmax",
                    tau: "0.1",
                    ...template
                  },
                  {
                    type: "softmax",
                    tau: "0.3",
                    ...template
                  },
                  {
                    type: "softmax",
                    tau: "0.7",
                    ...template
                  },
                  {
                    type: "softmax",
                    tau: "1",
                    ...template
                  },
                  {
                    type: "softmax",
                    tau: "2",
                    ...template
                  },
                  {
                    type: "softmax",
                    tau: "5",
                    ...template
                  }
                ];
                this.setState({ candidates });
              }}
            >
              Softmax with different temperatures
            </a>
            <br />
            <a
              href="#"
              onClick={() => {
                const template = {
                  variants: [
                    { ev: 0.3, r: 1 },
                    { ev: 0.4, r: 1 },
                    { ev: 0.7, r: 1 },
                    { ev: 0.9, r: 1 }
                  ],
                  minVisits: "10",
                  epsilon: "0.1",
                  delay: 10
                };
                const candidates = [
                  {
                    type: "softmax",
                    tau: "0.1",
                    ...template
                  },
                  {
                    type: "epsilon-greedy",
                    tau: "0.1",
                    ...template
                  },
                  {
                    type: "epsilon-greedy-decay",
                    decayFactor: "7",
                    ...template
                  }
                ];
                this.setState({ candidates });
              }}
            >
              Softmax vs Epsilon Greedy vs Epsilon Greedy Decay
            </a>
          </div>
        </Collapse>
        <Form>
          Options:
          <div
            style={{
              paddingLeft: "10px",
              marginTop: "10px",
              marginBottom: "10px"
            }}
          >
            <FormGroup style={{ display: "inline-block", marginRight: "10px" }}>
              <label>
                Simulations:{" "}
                <input
                  type="number"
                  min="1"
                  max="100000"
                  onChange={({ target: { value } }) =>
                    this.setState({ numSimulations: parseInt(value) })
                  }
                  value={numSimulations}
                />
              </label>
            </FormGroup>
            <FormGroup style={{ display: "inline-block", marginRight: "10px" }}>
              <label>
                Pulls per simulation:{" "}
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="10"
                  onChange={({ target: { value } }) =>
                    this.setState({ pullsPerSimulation: parseInt(value) })
                  }
                  value={pullsPerSimulation}
                />
              </label>
            </FormGroup>
          </div>
          Algorithms:
          <div
            style={{
              paddingLeft: "10px",
              marginTop: "10px",
              marginBottom: "10px"
            }}
          >
            {candidates.length === 0 && (
              <div>
                <i>no algorithms present</i>
              </div>
            )}
            {mapWithIndex((candidate, index) => (
              <CandidateAlgorithm
                key={index}
                index={index}
                stateChange={this.stateChange}
                candidate={candidate}
                addVariant={index => {
                  this.setState(oldState => {
                    const candidate = oldState.candidates[index];
                    candidate.variants = candidate.variants || [];
                    candidate.variants.push({ ev: 0.5, r: 1 });
                    return {
                      candidates: oldState.candidates
                    };
                  });
                }}
                removeAlgorithm={index => {
                  this.setState(oldState => ({
                    candidates: pullAt([index])(oldState.candidates)
                  }));
                }}
                replicateVariants={index => {
                  this.setState(oldState => {
                    const candidate = oldState.candidates[index];
                    const candidates = map(set("variants", candidate.variants))(
                      oldState.candidates
                    );
                    return {
                      candidates
                    };
                  });
                }}
                removeVariant={(index, variantIndex) => {
                  this.setState(oldState => {
                    const candidate = oldState.candidates[index];
                    candidate.variants = pullAt(variantIndex)(
                      candidate.variants
                    );
                    return {
                      candidates
                    };
                  });
                }}
              />
            ))(candidates)}
            <Button color="primary" onClick={this.addCandidate}>
              Add Algorithm
            </Button>
          </div>
        </Form>
        <Button
          disabled={outstandingSimulations}
          color="success"
          size="lg"
          onClick={async () => {
            this.setState({ outstandingSimulations: numSimulations });

            const executeSequentially = async thunks =>
              reduce(
                async (chain, thunk) => [...(await chain), await thunk()],
                Promise.resolve([])
              )(thunks);

            const thunks = flow(
              range(0),
              map(() => async () => {
                const data = await simulate(candidates, pullsPerSimulation);
                this.setState(state => ({
                  outstandingSimulations: state.outstandingSimulations - 1
                }));
                return data;
              })
            )(numSimulations);

            const simulationData = await executeSequentially(thunks);

            console.log(simulationData);

            const divideBy = diviser => n => n / diviser;

            const buildChartData = (type, displayName) =>
              flow(
                map(get(type)),
                zipAll,
                map(zipAll),
                map(
                  map(
                    flow(
                      sum,
                      divideBy(numSimulations)
                    )
                  )
                ),
                mapWithIndex((data, index) => [`${index + 1}`, ...data])
              );

            this.setState({
              chartDataCumulativeReward: {
                columns: buildChartData(
                  "cumulativeReward",
                  "Cumulative Reward"
                )(simulationData)
              },
              chartDataCumulativeRegret: {
                columns: buildChartData(
                  "cumulativeRegret",
                  "Cumulative Regret"
                )(simulationData)
              }
            });
          }}
        >
          Run!
        </Button>{" "}
        {!outstandingSimulations &&
          chartDataCumulativeReward &&
          chartDataCumulativeRegret && (
            <Button
              size="lg"
              color="warning"
              outline
              onClick={() =>
                this.setState({
                  chartDataCumulativeReward: undefined,
                  chartDataCumulativeRegret: undefined
                })
              }
            >
              Clear
            </Button>
          )}
        {outstandingSimulations ? (
          <div>
            <strong>Working: {outstandingSimulations}</strong>
          </div>
        ) : (
          <div>
            {chartDataCumulativeReward && (
              <React.Fragment>
                <h3>Cumulative Reward</h3>
                <div style={{ width: "100%", height: "400px" }}>
                  <Chart
                    config={{
                      data: chartDataCumulativeReward
                    }}
                  />
                </div>
              </React.Fragment>
            )}
            {chartDataCumulativeRegret && (
              <React.Fragment>
                <h3>Cumulative Regret</h3>
                <div style={{ width: "100%", height: "400px" }}>
                  <Chart
                    config={{
                      data: chartDataCumulativeRegret
                    }}
                  />
                </div>
              </React.Fragment>
            )}
          </div>
        )}
      </div>
    );
  }
}
export default App;
