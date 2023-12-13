// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library StringUtils {
    function escape(string memory str) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        uint extraChars = 0;

        // count extra space needed for escaping
        for (uint i = 0; i < strBytes.length; i++) {
            if (_needsEscaping(strBytes[i])) {
                extraChars++;
            }
        }

        // allocate buffer with the exact size needed
        bytes memory buffer = new bytes(strBytes.length + extraChars);
        uint index = 0;

        // escape characters
        for (uint i = 0; i < strBytes.length; i++) {
            if (_needsEscaping(strBytes[i])) {
                buffer[index++] = "\\";
                buffer[index++] = _getEscapedChar(strBytes[i]);
            } else {
                buffer[index++] = strBytes[i];
            }
        }

        return string(buffer);
    }

    // determine if a character needs escaping
    function _needsEscaping(bytes1 char) private pure returns (bool) {
        return
            char == '"' ||
            char == "/" ||
            char == "\\" ||
            char == "\n" ||
            char == "\r" ||
            char == "\t";
    }

    // get the escaped character
    function _getEscapedChar(bytes1 char) private pure returns (bytes1) {
        if (char == "\n") return "n";
        if (char == "\r") return "r";
        if (char == "\t") return "t";
        return char;
    }
}
