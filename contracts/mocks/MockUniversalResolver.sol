// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;
import {NameEncoder} from "@ensdomains/ens-contracts/contracts/utils/NameEncoder.sol";

contract MockUniversalResolver {
    using NameEncoder for string;

    mapping(address => string) private names;
    mapping(string => string) private avatars;

    function setName(address addr, string memory name) external {
        names[addr] = name;
    }

    function setAvatar(string memory name, string memory avatarUri) external {
        avatars[name] = avatarUri;
    }

    function reverse(
        bytes memory encodedName
    ) external view returns (string memory, address, address, address) {
        require(encodedName.length >= 42, "Invalid encoded name length");

        // Extract the hex address from the encoded name
        bytes memory hexAddr = new bytes(40);
        for (uint i = 0; i < 40; i++) {
            hexAddr[i] = encodedName[i + 1];
        }

        // Convert hex string to address
        address addr = address(uint160(_hexToUint(hexAddr)));

        return (names[addr], addr, address(0), address(0));
    }

    function resolve(
        bytes memory encodedName,
        bytes memory data
    ) external view returns (bytes memory, address) {
        string memory name = _dnsNameToString(encodedName);
        (, bytes32 nameHash) = name.dnsEncodeName();

        if (
            keccak256(data) ==
            keccak256(
                abi.encodeWithSignature(
                    "text(bytes32,string)",
                    nameHash,
                    "avatar"
                )
            )
        ) {
            return (abi.encode(avatars[name]), address(0));
        }
        return (new bytes(0), address(0));
    }

    function _hexToUint(bytes memory _hex) internal pure returns (uint256) {
        uint256 result = 0;
        for (uint i = 0; i < _hex.length; i++) {
            uint8 digit = uint8(_hex[i]);
            if (digit >= 48 && digit <= 57) {
                result = result * 16 + (digit - 48);
            } else if (digit >= 97 && digit <= 102) {
                result = result * 16 + (digit - 87);
            } else if (digit >= 65 && digit <= 70) {
                result = result * 16 + (digit - 55);
            } else {
                revert("Invalid hex character");
            }
        }
        return result;
    }

    function _dnsNameToString(
        bytes memory dnsName
    ) internal pure returns (string memory) {
        bytes memory result = new bytes(dnsName.length);
        uint resultIndex = 0;
        uint i = 0;

        while (i < dnsName.length) {
            uint labelLength = uint8(dnsName[i]);
            if (labelLength == 0) break;

            if (resultIndex > 0) {
                result[resultIndex++] = ".";
            }

            for (uint j = 1; j <= labelLength && i + j < dnsName.length; j++) {
                result[resultIndex++] = dnsName[i + j];
            }

            i += labelLength + 1;
        }

        bytes memory trimmedResult = new bytes(resultIndex);
        for (uint k = 0; k < resultIndex; k++) {
            trimmedResult[k] = result[k];
        }

        return string(trimmedResult);
    }
}
