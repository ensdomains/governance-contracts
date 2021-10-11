const fs = require('fs');
const airdrop = Object.fromEntries(fs.readFileSync('./airdrop.json', {encoding: 'utf-8'})
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line))
    .map((entry) => [
        entry.owner.toLowerCase(),
        (parseFloat(entry.past_tokens || 0) + parseFloat(entry.future_tokens || 0)) / 1e18
    ]));

/**
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.serve = (req, res) => {
    const addresses = req.query.addresses.split(',');
    const results = addresses.map((address) => {
        const value = airdrop[address];
        if(value === undefined) {
            return {address, value: 0.0};
        }
        return {address, value};
    });
    res.status(200).json({score: results});
};
