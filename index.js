require("dotenv").config();
const express = require('express');
const app = express();
const cors = require('cors');
const admin = require("firebase-admin");
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = 3000;

const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fm0wyio.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyFirebaseToken = async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({
            message: "Unauthorized access"
        });
    }
    const token = authorization.split(" ")[1];
    if (!token) {
        return res.status(401).send({
            message: "Unauthorized access"
        });
    }
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.token_email = decoded.email;
        next();
    }
    catch {
        console.log("Invalid token");
        return res.status(401).send({
            message: "Unauthorized access"
        });
    }
}

app.get("/", (req, res) => {
    res.send("Smart deals server is running");
});

async function run(){
    try{
        await client.connect();
        const db = client.db("smart_deals");
        const productsCollection = db.collection("products");
        const bidsCollection = db.collection("bids");
        const usersCollection = db.collection("users");

        app.post("/getToken", (req, res) => {
            const loggedUser = req.body
            const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {expiresIn: "1h"});
            res.send({token: token});
        });

        // User apis
        app.post("/users", async(req, res) => {
            const newUser = req.body;
            const email = req.body.email;
            const query = {email: email};
            const existingUser = await usersCollection.findOne(query);
            if(existingUser){
                res.send({
                    message: "User already exists."
                });
            }
            else{
                const result = await usersCollection.insertOne(newUser);
                res.send(result);
            }
        });

        // products related apis
        app.get("/products", async(req, res) => {
            const email = req.query.email;
            const query = {};
            if(email) query.email = email;
            const cursor = productsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get("/latest-products", async(req, res) => {
            const cursor = productsCollection.find().sort({created_at: -1}).limit(8);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get("/products/:id", async(req, res) => {
            const {id} = req.params;
            const query = {_id: new ObjectId(id)};
            const result = await productsCollection.findOne(query);
            res.send(result);
        });

        app.get("/my-products", verifyFirebaseToken, async (req, res) => {
            const {email} = req.query;
            const query = {};
            if (email) query.seller_email = email;
            const cursor = productsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.post("/products", verifyFirebaseToken, async(req, res) => {
            const newProduct = req.body;
            const result = await productsCollection.insertOne(newProduct);
            res.send(result);
        });

        app.patch("/products/:id", async(req, res) => {
            const {id} = req.params;
            const updatedProduct = req.body;
            const query = {_id: new ObjectId(id)};
            const update = {
                $set: updatedProduct,
            }
            const result = await productsCollection.updateOne(query, update);
            res.send(result);
        });

        app.patch("/products/make-sold/:id", async(req, res) => {
            const {id} = req.params;
            const query = {_id: new ObjectId(id)};
            const update = {
                $set: {
                    status: "sold"
                }
            }
            const result = await productsCollection.updateOne(query, update);
            res.send(result);
        });

        app.delete("/products/:id", async(req, res) => {
            const {id} = req.params;
            const query = {_id: new ObjectId(id)};
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });

        // bids related apis
        app.get("/bids", verifyFirebaseToken, async(req, res) => {
            const {email} = req.query;
            const query = {};
            if(email){
                query.buyer_email = email;
                if(email !== req.token_email){
                    return res.status(403).send({
                        message: "Forbidden access"
                    });
                }
            };
            const cursor = bidsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get("/products/bids/:productId", verifyFirebaseToken, async(req, res) => {
            const {productId} = req.params;
            const query = {product: productId};
            const cursor = bidsCollection.find(query).sort({bid_price: -1});
            const result = await cursor.toArray();
            res.send(result);
        });

        app.post("/bids", async(req, res) => {
            const newBid = req.body;
            const result = await bidsCollection.insertOne(newBid);
            res.send(result);
        });

        app.delete("/bids/:id", async(req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await bidsCollection.deleteOne(query);
            res.send(result);
        });

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    }
    finally{
        
    }
}
run().catch(console.dir);

client.connect()
    .then(() => {
        app.listen(port, () => {
            console.log(`Smart server is running now on port: ${port}`)
        })

    })
    .catch(console.dir)