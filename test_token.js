const jwt = require("jsonwebtoken");
console.log(jwt.sign({userId: "test_user_123"}, "5914b1e09b3abed77998c395b950146ee0a0d320ec34165e4b9deca70c82d4c41d22bf413e2c1cdf604c61b1fca0ade9b31ffc4e9afac4c2b7841346b9e32ac5", {expiresIn: "1h"}));
