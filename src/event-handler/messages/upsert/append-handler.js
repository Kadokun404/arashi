const appendHandler = async (bem, sock) => {
    const { messages } = bem

    for (const WAM of messages) {
        console.log(`append`, WAM)
    }
}

export { appendHandler }