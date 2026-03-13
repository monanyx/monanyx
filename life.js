const { Life } = require('dat-life');

const boardWidth = 80; // width of the game board
const boardHeight = 24; // height of the game board

const life = new Life(boardWidth, boardHeight);
life.randomize(); // set up the initial board with random population

while (true) {
    for (let y = 0; y < boardHeight; y++) {
        for (let x = 0; x < boardWidth; x++) {
            if (life.get(x, y)) {
                process.stdout.write('*');
            }
            else {
                process.stdout.write(' ');
            }
        }

        process.stdout.write('\n');
    }

    process.stdout.write('\n');
    life.next();
}