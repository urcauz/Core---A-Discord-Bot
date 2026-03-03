const Counter = require('../models/Counter');

async function getNextSequence(sequenceName) {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return counter.seq;
}

module.exports = {
  getNextSequence
};
