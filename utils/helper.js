import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library';

export const generateToken = (id) => {
    const token = jwt.sign(
        {
            _id: id,
        },
        process.env.SECRET_KEY,
        
    );
    return token;
};
export const getUserData = async(access_token) => {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token${access_token}`)
    const data = await response.json()
    console.log("data",data)
    console.log("Response",response)
}


export const generateRandomNumbers = () =>{
    let numbers = [];
    for (let i = 0; i < 6; i++) {
        numbers.push(Math.floor(Math.random() * 9) + 1); // Generates a number between 1 and 9
    }
    return numbers;
}

