const fs = require('fs');
const airdrop = Object.fromEntries(fs.readFileSync('./airdrop.json', {encoding: 'utf-8'})
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line))
    .map((entry) => [
        entry.owner.toLowerCase(),
        BigInt(entry.past_tokens.toString().split('.')[0] || 0)
            + BigInt(entry.future_tokens.toString().split('.')[0] || 0)
    ]));

/**
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.serve = (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const addresses = req.query.addresses.split(',');
    const results = addresses.map((address) => {
        const value = airdrop[address?.toLowerCase()];
        if(value === undefined) {
            return {address, score: "0"};
        }
        return {address, score: value?.toString()};
    });
    res.status(200).json({score: results});
};
