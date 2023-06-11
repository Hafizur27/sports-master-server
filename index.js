const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({Error: true, message: 'unauthorized access'});
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) =>{
    if(error){
      return res.status(401).send({Error: true, message: 'unauthorized access'});
    }
    req.decoded = decoded;
    next();
  })
};




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lo1m20r.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db("sportsDB").collection("users"); 
    const classCollection = client.db("sportsDB").collection("classes");
    const selectClassCollection = client.db("sportsDB").collection("SelectClasses");
    const paymentCollection = client.db("sportsDB").collection("payments");


    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'})
      res.send({token});
    });

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query =  {email: email};
      const user = await usersCollection.findOne(query);
    if(user?.role !== 'admin'){
      return res.status(403). send({error: true, message: 'forbidden User'});
    }
    next();
      
    };


    // verify instructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query =  {email: email};
      const user = await usersCollection.findOne(query);
    if(user?.role !== 'instructor'){
      return res.status(403). send({error: true, message: 'forbidden User'});
    }
    next();
      
    };

    // get admin api
    app.get('/users/admin/:email', verifyJWT,  async(req, res) =>{
      const email = req.params.email;
      if(req.decoded.email !== email){
        res.send({admin: false})
      }
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      const result = {admin: user?.role === 'admin'};
      res.send(result);
    });

    // Admin api
    app.patch('/users/admin/:id', async(req, res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result);
    });

    // get instructor api
    app.get('/users/instructor/:email', verifyJWT,  async(req, res) =>{
      const email = req.params.email;
      if(req.decoded.email !== email){
        res.send({admin: false})
      }
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      const result = {admin: user?.role === 'instructor'};
      res.send(result);
    });

    // instructor api
    app.patch('/users/instructor/:id', async(req, res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result);
    });

    // users get api
    app.get('/users',verifyJWT, async(req, res) =>{
      
        const result = await usersCollection.find().toArray();
        res.send(result);
    });

    // users create api
    app.post ('/users', async(req, res) =>{
      const user = req.body;
      const query = {email: user?.email};
      const existingUser = await usersCollection.findOne(query);
      if(existingUser){
        return res.send({message: 'User already exists'});
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get all class api for instructor
    app.get('/allClass', async(req, res) =>{
      const result = await classCollection.find().toArray();
      res.send(result);
    })

    // single sports class create api for instructor
    app.post('/addClass', async(req, res) =>{
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    // status approve api
    app.patch('/addClass/approve/:id', async(req, res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: 'approve'
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc)
      res.send(result);
      
    });

    // status deny api
    app.patch('/addClass/deny/:id', async(req, res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: 'deny'
        }
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    })


    // getting all selected class of student
    app.get('/selectClass', async(req, res) =>{
      const result =  await selectClassCollection.find().toArray();
      res.send(result);
    })

     // select class post api
     app.post('/selectClass', async(req, res) => {
      const selectClass = req.body;
      const query = {category: selectClass?.category};
      const alreadySelect = await selectClassCollection.findOne(query);
      if(alreadySelect){
        return res.send({message: 'already select this category'});
      }
      const result = await selectClassCollection.insertOne(selectClass);
      res.send(result);
     })

    // create payment intent
    app.post('/create-payment-intent', verifyJWT, async(req, res) => {
      const {price} = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency : 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    // get all payment info api
    app.get('/payments', async(req, res) =>{
      const result = await paymentCollection.find().toArray();
      res.send(result);
    })

    // payment related api
    app.post('/payments',verifyJWT, async(req, res) =>{
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {_id: {$in: payment.menuId.map(id => new ObjectId(id))}}
      const deleteResult = await selectClassCollection.deleteMany(query);
      res.send({insertResult, deleteResult});
    })

   


 

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('sports master is running');
});

app.listen(port, () => {
    console.log(`sports master is running on port ${port}`);
});